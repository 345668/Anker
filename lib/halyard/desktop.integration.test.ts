import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
process.env.SECRET_KEY = "halyard-desktop-test-secret"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const st = vi.hoisted(() => ({ query: vi.fn(), flag: true, allowance: null as string | null, auth: null as string | null, device: null as any, deviceErr: null as any, browser: null as any }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => st.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, v: unknown[]) => st.query(q, v) }) }))
vi.mock("@/lib/entitlements", () => ({ isFlagOn: async () => st.flag, getEffective: async () => ({ features: { halyard: true }, limits: {} }), limitOf: async () => null }))
vi.mock("@/lib/metering/allowance", () => ({ assertCan: async () => { if (st.allowance) throw new Error(st.allowance) } }))
vi.mock("@/lib/ai/data-policy", () => ({ assertProviderAllowed: async () => {} }))
vi.mock("@/lib/ai/provider", () => ({ generateDetailed: async () => ({ text: "", model: null, error: "none" }) }))
vi.mock("@/lib/calls/analyze", () => ({ analyzeCall: vi.fn() }))
vi.mock("@/lib/actions/store", () => ({ propose: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => (k.toLowerCase() === "authorization" ? st.auth : null) }) }))
vi.mock("@/lib/calls/devices", () => ({ authenticateDevice: async () => { if (st.deviceErr) throw st.deviceErr; return st.device } }))
vi.mock("@/lib/auth/workspace-context", () => ({ requireWorkspace: async () => st.browser, workspaceError: (e: any) => ({ error: String(e) }) }))
vi.mock("@/lib/assistant/principal", () => ({ resolveAiPrincipal: async () => ({}) }))
vi.mock("@/lib/assistant/context", () => ({ withAiContext: async (_p: any, run: any) => run() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }))

import { createSession, addSegment, endSession, type SessionRow } from "./sessions"
import { saveNotes } from "./notes"
import { follow, type FollowEvent } from "./follow"
import { shareSession, unshareSession, viewableSession } from "./sharing"
import { completeForDesktop, LIMITS } from "./provider"
import { halyardWho } from "./route"
import { finishSession } from "./finish"
import { CallError } from "@/lib/calls/access"

let db: PGlite
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
const ORG = "org-1", USER = "user-1"
const start = (over: Record<string, unknown> = {}) => createSession({ orgId: ORG, userId: USER, consentAttested: true, ...over } as any)
const collect = async (it: AsyncGenerator<FollowEvent>, max = 100) => { const out: FollowEvent[] = []; for await (const e of it) { out.push(e); if (out.length >= max) break } return out }

beforeAll(async () => {
  db = new PGlite(); st.query.mockImplementation(async (q, values) => (await db.query(q, values as any[])).rows)
  await db.exec(`CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text);
    CREATE TABLE plan_catalog(plan text PRIMARY KEY, features jsonb DEFAULT '{}', limits jsonb DEFAULT '{}');
    CREATE TABLE memberships(user_id text, org_id text, org_role text, UNIQUE(user_id, org_id));
    CREATE TABLE profiles(id text PRIMARY KEY, email text, full_name text);
    CREATE TABLE crm_entries(id text PRIMARY KEY, org_id text);
    CREATE TABLE investor_calls(id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, org_id text, persona text, title text, investor_name text, transcript text, crm_entry_id text, occurred_at timestamptz,
      external_id text, content_hash text, source text, status text, summary text, deleted_at timestamptz, analysis_error text, updated_at timestamptz DEFAULT now());
    CREATE UNIQUE INDEX ON investor_calls(user_id, org_id, external_id) WHERE external_id IS NOT NULL;`)
  await db.exec(readFileSync("scripts/migrations/2026-10-27-halyard-sessions.sql", "utf8")); await db.exec(readFileSync("scripts/migrations/2026-10-28-halyard-governance.sql", "utf8")); await db.exec(readFileSync("scripts/migrations/2026-10-30-halyard-playbooks.sql", "utf8"))
})
afterAll(async () => db.close())
beforeEach(async () => { Object.assign(st, { flag: true, allowance: null, auth: null, device: null, deviceErr: null, browser: null }); await db.exec("DELETE FROM halyard_sessions; DELETE FROM memberships; DELETE FROM profiles; DELETE FROM investor_calls") })

describe("who is calling", () => {
  it("a paired desktop key acts as its owner in its workspace, as a plain member, with its device id; a bad key is refused with the app's own words; a person in a browser still works", async () => {
    st.auth = "Bearer anker_call_" + "a".repeat(43); st.device = { userId: USER, orgId: ORG, persona: "founder", workspace: "Acme", writable: true, deviceId: "dev-1" }
    expect(await halyardWho(true)).toMatchObject({ userId: USER, orgId: ORG, via: "device", deviceId: "dev-1", role: "member", name: "Acme" })
    st.deviceErr = new CallError("Device expired, revoked or workspace access changed. Reconnect from Anker.", 401)
    await expect(halyardWho(true)).rejects.toMatchObject({ status: 401, code: "device", message: expect.stringContaining("Reconnect") })
    st.auth = null; st.browser = { userId: "u2", orgId: ORG, persona: "vc", name: "Fund", role: "admin" }
    expect(await halyardWho(true)).toMatchObject({ userId: "u2", via: "browser", role: "admin", deviceId: null })
    st.auth = "Bearer something-else"; expect((await halyardWho(true)).via).toBe("browser")        // only anker_call_ keys count as device keys
  })
  it("a desktop session records its source and device, takes text instead of audio, and its call record says so", async () => {
    const s = await start({ source: "desktop", stt: "local", deviceId: "dev-1", title: "Desk call" })
    expect(s).toMatchObject({ source: "desktop", stt: "local", device_id: "dev-1" })
    for (let i = 0; i < 10; i++) await addSegment(s, { seq: i, channel: i % 2 ? "you" : "them", text: `Turn ${i} ` + Array.from({ length: 12 }, (_, k) => `q${i * 29 + k}`).join(" "), startedMs: i * 9000 })
    const r = await finishSession(s, { userId: USER, orgId: ORG, persona: "founder", writable: true, workspace: "Acme" }, { notesModel: async () => { throw new Error("no model") }, analyze: async () => { throw new Error("no provider") } })
    expect((await one("SELECT source FROM investor_calls WHERE id=$1", [r.callId])).source).toBe("halyard-desktop")
  })
})

describe("Anker AI as the desktop's provider", () => {
  const ok = (calls: any[] = []) => async (prompt: string, o: any) => { calls.push({ prompt, o }); return { text: "Say it plainly.", model: "m", error: null } }
  it("one completion through the workspace's AI: the task comes from the action, the prompt is system then text, tokens are capped", async () => {
    const calls: any[] = []
    expect(await completeForDesktop(ORG, { system: "SYS", text: "USER", action: "recap", maxTokens: 99999 }, ok(calls))).toEqual({ text: "Say it plainly.", model: "m" })
    expect(calls[0]).toEqual({ prompt: "SYS\n\nUSER", o: { task: "halyard_recap", maxTokens: LIMITS.maxTokens } })
    await completeForDesktop(ORG, { system: "", text: "T", action: "answerThis" }, ok(calls)); expect(calls[1]).toEqual({ prompt: "T", o: { task: "halyard_say", maxTokens: 700 } })
    await completeForDesktop(ORG, { text: "T", action: "nonsense", maxTokens: 1 }, ok(calls)); expect(calls[2].o).toEqual({ task: "halyard_ask", maxTokens: 50 })
  })
  it("refuses an empty or oversized request, an exhausted allowance and a switched-off Halyard before the model is touched; a failing model gives a plain message", async () => {
    const calls: any[] = []
    await expect(completeForDesktop(ORG, { text: "  " }, ok(calls))).rejects.toMatchObject({ code: "empty" })
    await expect(completeForDesktop(ORG, { system: "x".repeat(LIMITS.system + 1), text: "t" }, ok(calls))).rejects.toMatchObject({ status: 413 })
    await expect(completeForDesktop(ORG, { text: "x".repeat(LIMITS.text + 1) }, ok(calls))).rejects.toMatchObject({ status: 413 })
    st.allowance = "Allowance used."; await expect(completeForDesktop(ORG, { text: "t" }, ok(calls))).rejects.toMatchObject({ code: "allowance", status: 402 }); st.allowance = null
    st.flag = false; await expect(completeForDesktop(ORG, { text: "t" }, ok(calls))).rejects.toMatchObject({ code: "off" }); st.flag = true
    expect(calls).toHaveLength(0)
    await expect(completeForDesktop(ORG, { text: "t" }, async () => ({ text: "", model: null, error: "boom 500 secret" }))).rejects.toMatchObject({ code: "model", message: expect.not.stringContaining("secret") })
  })
})

describe("following along", () => {
  const sleepAdd = (s: SessionRow, plan: Array<() => Promise<void>>) => async () => { const f = plan.shift(); if (f) await f() }
  it("sends the turns, the notes (never the email draft) and the state in order, picks up what arrives while it waits, and ends when the call ends", async () => {
    const s = await start(); await addSegment(s, { seq: 0, channel: "them", text: "We closed the seed round at five million dollars", startedMs: 0 })
    await saveNotes(s, { summary: "First", email: "PRIVATE EMAIL DRAFT" } as any, "ai")
    const evs = await collect(follow(s.id, { afterSeq: -1, pollMs: 1, sleep: sleepAdd(s, [
      async () => { await addSegment(s, { seq: 1, channel: "you", text: "Great, when does the first LOI convert to revenue", startedMs: 9000 }) },
      async () => { await saveNotes(s, { summary: "Second" } as any, "ai"); await endSession(s) },
    ]) }))
    expect(evs.map((e) => e.event)).toEqual(["turn", "notes", "state", "turn", "notes", "state"]); expect(evs[0]).toMatchObject({ id: "0", data: { seq: 0, channel: "them" } }); expect(evs[3]).toMatchObject({ id: "1" })
    expect((evs[1].data as any).body.email).toBe(""); expect(JSON.stringify(evs)).not.toContain("PRIVATE"); expect(evs[2].data).toEqual({ state: "live" }); expect(evs[5].data).toEqual({ state: "ended" })
  })
  it("resumes after the last turn it was given, so a reconnect misses nothing and repeats nothing", async () => {
    const s = await start(); for (let i = 0; i < 5; i++) await addSegment(s, { seq: i, channel: "them", text: `Distinct turn ${i} ` + Array.from({ length: 10 }, (_, k) => `r${i * 41 + k}`).join(" "), startedMs: i * 5000 })
    await endSession(s)
    expect((await collect(follow(s.id, { afterSeq: 2, pollMs: 1 }))).filter((e) => e.event === "turn").map((e) => e.id)).toEqual(["3", "4"])
  })
  it("stops when access is withdrawn mid-stream, stops at its time limit on a live call, and says when the call was deleted", async () => {
    const s = await start(); await addSegment(s, { seq: 0, channel: "them", text: "Hello there everyone on the line today", startedMs: 0 })
    let allowed = true; const revoked = await collect(follow(s.id, { afterSeq: -1, pollMs: 1, allowed: async () => allowed, sleep: async () => { allowed = false } }))
    expect(revoked.at(-1)!.event).toBe("revoked"); expect(revoked.some((e) => e.event === "turn")).toBe(true)
    let t = 0; const timed = await collect(follow(s.id, { afterSeq: 0, pollMs: 1, maxMs: 100, now: () => (t += 60), sleep: async () => {} })); expect(timed.map((e) => e.event)).toEqual(["state"])
    await db.query("DELETE FROM halyard_sessions WHERE id=$1", [s.id]); expect((await collect(follow(s.id, { afterSeq: -1 }))).map((e) => e.data)).toEqual([{ state: "deleted" }])
  })
  it("a colleague can be given the view of a live call and loses it when it is withdrawn", async () => {
    await db.query("INSERT INTO memberships VALUES ($1,$2,'member'), ('mate',$2,'member')", [USER, ORG]); await db.query("INSERT INTO profiles VALUES ('user-1','o@x','Owner'), ('mate','m@x','Mate')")
    const s = await start(); await expect(viewableSession(s.id, ORG, "mate")).rejects.toMatchObject({ status: 404 })
    await shareSession(s, "mate"); expect((await viewableSession(s.id, ORG, "mate")).role).toBe("viewer"); await unshareSession(s, "mate"); await expect(viewableSession(s.id, ORG, "mate")).rejects.toMatchObject({ status: 404 })
  })
})
