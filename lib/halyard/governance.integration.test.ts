import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
process.env.SECRET_KEY = "halyard-gov-test-secret"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const st = vi.hoisted(() => ({ query: vi.fn(), flag: true, feature: true }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => st.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, v: unknown[]) => st.query(q, v) }) }))
vi.mock("@/lib/entitlements", () => ({ isFlagOn: async () => st.flag, getEffective: async () => ({ features: { halyard: st.feature }, limits: {} }), limitOf: async () => null }))
vi.mock("@/lib/metering/allowance", () => ({ assertCan: async () => {} }))
vi.mock("@/lib/ai/data-policy", () => ({ assertProviderAllowed: async () => {} }))
vi.mock("@/lib/ai/provider", () => ({ generateDetailed: async () => ({ text: "", model: null, error: "none" }) }))
vi.mock("@/lib/calls/analyze", () => ({ analyzeCall: vi.fn() }))
vi.mock("@/lib/actions/store", () => ({ propose: vi.fn() }))

import { createSession, addSegment, endSession, deleteSession, sweepSessions, saveSettings, getSettings, ownedSession } from "./sessions"
import { act } from "./brain"
import { ingestUtterance, _resetRate } from "./utterance"
import { draftNotes, saveNotes, refreshLiveNotes } from "./notes"
import { exportPersonalData } from "./personal-export"
import { shareSession } from "./sharing"
import { encryptSecret } from "@/lib/db/secrets"

let db: PGlite
const one = async (q: string, v: unknown[] = []) => (await db.query<any>(q, v)).rows[0]
const ORG = "org-1", USER = "user-1", MARK = "ZEBRA-9931"
const start = (over: Record<string, unknown> = {}) => createSession({ orgId: ORG, userId: USER, consentAttested: true, participantsInformed: true, ...over } as any)
const model = async () => ({ text: "Say it.", model: "m", error: null })

beforeAll(async () => {
  db = new PGlite(); st.query.mockImplementation(async (q, values) => (await db.query(q, values as any[])).rows)
  await db.exec(`CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean, rollout_pct int, description text);
    CREATE TABLE plan_catalog(plan text PRIMARY KEY, features jsonb DEFAULT '{}', limits jsonb DEFAULT '{}');
    CREATE TABLE memberships(user_id text, org_id text, org_role text, UNIQUE(user_id, org_id));
    CREATE TABLE profiles(id text PRIMARY KEY, email text, full_name text);
    CREATE TABLE investor_calls(id text PRIMARY KEY DEFAULT gen_random_uuid()::text, user_id text, org_id text, transcript text, summary text, draft_followup text, deleted_at timestamptz);
    CREATE TABLE outreach_messages(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), call_id text, body text, status text);
    CREATE TABLE action_proposals(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text, run_id text, status text, input jsonb, diff jsonb, evidence jsonb, summary text);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-27-halyard-sessions.sql", "utf8")); await db.exec(readFileSync("scripts/migrations/2026-10-28-halyard-governance.sql", "utf8"))
})
afterAll(async () => db.close())
beforeEach(async () => { Object.assign(st, { flag: true, feature: true }); _resetRate(); await db.exec("DELETE FROM halyard_sessions; DELETE FROM halyard_settings; DELETE FROM halyard_uploads; DELETE FROM halyard_prep; DELETE FROM investor_calls; DELETE FROM outreach_messages; DELETE FROM action_proposals; DELETE FROM memberships; DELETE FROM profiles") })

describe("the kill switch", () => {
  it("stops every live action at once, with the reason and the reassurance, and never stops reading, exporting or deleting", async () => {
    const s = await start(); await addSegment(s, { seq: 0, channel: "them", text: "We closed the round at five million dollars", startedMs: 0 })
    st.flag = false
    const off = { code: "off", status: 403, message: expect.stringContaining("still yours") }
    await expect(addSegment(s, { seq: 1, channel: "you", text: "Great news indeed" })).rejects.toMatchObject(off)
    await expect(act(s, "say", {}, model)).rejects.toMatchObject(off)
    await expect(ingestUtterance(s, { seq: 2, channel: "room", startedMs: 0, endedMs: 1000, bytes: Buffer.from("x"), mime: "audio/wav" }, async () => "x")).rejects.toMatchObject(off)
    await expect(draftNotes(s, async () => "x")).rejects.toMatchObject(off); await expect(refreshLiveNotes(s, async () => "x")).rejects.toMatchObject(off)
    await expect(createSession({ orgId: ORG, userId: "u9", consentAttested: true })).rejects.toMatchObject({ code: "off" })
    expect((await exportPersonalData(ORG, USER)).sessions).toHaveLength(1); expect((await endSession(s)).state).toBe("ended"); await expect(deleteSession(s)).resolves.toBeUndefined()
  })
  it("a workspace whose feature an operator turned off is stopped too, while the platform stays on for others", async () => {
    const s = await start(); st.feature = false
    await expect(addSegment(s, { seq: 0, channel: "you", text: "Hello there everyone" })).rejects.toMatchObject({ code: "plan", message: expect.stringContaining("still yours") })
    st.feature = true; await expect(addSegment(s, { seq: 0, channel: "you", text: "Hello there everyone" })).resolves.toMatchObject({ stored: true })
  })
})

describe("workspace rules", () => {
  it("retention is 1 to 120 whole months and applies to calls already finished; the consent confirmation can be required", async () => {
    await expect(saveSettings(ORG, { retentionMonths: 0 })).rejects.toMatchObject({ code: "bad_retention" }); await expect(saveSettings(ORG, { retentionMonths: 1.5 })).rejects.toMatchObject({ code: "bad_retention" }); await expect(saveSettings(ORG, { retentionMonths: 121 })).rejects.toMatchObject({ code: "bad_retention" })
    const s = await start(); const ended = await endSession(s, new Date("2026-01-15T00:00:00Z")); expect(new Date(ended.delete_after!).toISOString()).toBe("2027-01-15T00:00:00.000Z")
    expect(await saveSettings(ORG, { retentionMonths: 3 })).toEqual({ retentionMonths: 3, requireInformed: false })
    expect(new Date((await one("SELECT delete_after FROM halyard_sessions WHERE id=$1", [s.id])).delete_after).toISOString()).toBe("2026-04-15T00:00:00.000Z")
    expect((await sweepSessions(new Date("2026-05-01T00:00:00Z"))).deleted).toBe(1)
    await saveSettings(ORG, { requireInformed: true }); expect(await getSettings(ORG)).toEqual({ retentionMonths: 3, requireInformed: true })
    await expect(createSession({ orgId: ORG, userId: "u2", consentAttested: true })).rejects.toMatchObject({ code: "inform_required" })
    await expect(createSession({ orgId: ORG, userId: "u2", consentAttested: true, participantsInformed: true })).resolves.toMatchObject({ participants_informed: true, consent_version: "v1" })
  })
})

describe("deleting a call leaves nothing", () => {
  it("removes the text, the call record, unsent drafts, pending proposals and shares; blanks decided proposals; keeps a sent message but unlinks it", async () => {
    await db.query("INSERT INTO memberships VALUES ('user-1', $1, 'owner'), ('mate', $1, 'member')", [ORG])
    const s = await start({ title: `Call ${MARK}` }); await addSegment(s, { seq: 0, channel: "them", text: `The code word is ${MARK} and the price is two million`, startedMs: 0, endedMs: 5000 })
    await act(s, "say", {}, async () => ({ text: `Suggestion about ${MARK}`, model: "m", error: null }))
    await saveNotes(s, { summary: `Notes ${MARK}`, keyPoints: [`Point ${MARK}`], decisions: [], actionItems: [], followUp: [], figures: [], email: `Email ${MARK}` }, "user")
    await db.query("INSERT INTO halyard_prep (org_id, user_id, mode, context_enc) VALUES ($1,$2,'general',$3)", [ORG, USER, encryptSecret(`prep ${MARK}`)])
    await db.query("INSERT INTO halyard_briefs (session_id, version, upto_seq, brief_enc) VALUES ($1, 1, 0, $2)", [s.id, encryptSecret(`brief ${MARK}`)])
    const ended = await endSession(s), callId = (await one("INSERT INTO investor_calls (user_id, org_id, transcript, summary, draft_followup) VALUES ($1,$2,$3,$3,$3) RETURNING id", [USER, ORG, `transcript ${MARK}`])).id
    await db.query("UPDATE halyard_sessions SET call_id=$1 WHERE id=$2", [callId, s.id]); await shareSession({ ...ended, call_id: callId }, "mate")
    await db.query("INSERT INTO outreach_messages (call_id, body, status) VALUES ($1, $2, 'draft'), ($1, $2, 'sent')", [callId, `follow up ${MARK}`])
    await db.query("INSERT INTO action_proposals (org_id, run_id, status, input, diff, evidence, summary) VALUES ($1,$2,'pending','{\"t\":\"ZEBRA-9931\"}','[]','{}',$3), ($1,$4,'applied','{\"t\":\"ZEBRA-9931\"}','[{\"after\":\"ZEBRA-9931\"}]','{\"n\":\"ZEBRA-9931\"}',$3), ($1,'other-run','pending','{}','[]','{}','Unrelated')", [ORG, `halyard:${s.id}`, `Task ${MARK}`, `halyard-email:${s.id}:2`])
    const dump = async () => { let n = 0; for (const t of (await db.query<any>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")).rows) n += (await db.query<any>(`SELECT count(*)::int AS n FROM "${t.table_name}" x WHERE x::text LIKE '%${MARK}%'`)).rows[0].n; return n }
    expect(await dump()).toBeGreaterThanOrEqual(6)                   // the check is meaningful: the marker is in many places before the delete
    await deleteSession({ ...ended, call_id: callId })
    expect(await dump()).toBe(1)                                      // only the SENT message remains: a record of what went out
    expect((await db.query("SELECT body, status, call_id FROM outreach_messages")).rows).toEqual([{ body: `follow up ${MARK}`, status: "sent", call_id: null }])
    expect((await db.query("SELECT summary, status FROM action_proposals ORDER BY summary")).rows).toEqual([{ summary: "Removed with the call it came from", status: "applied" }, { summary: "Unrelated", status: "pending" }])
    for (const t of ["halyard_sessions", "halyard_segments", "halyard_briefs", "halyard_suggestions", "halyard_notes", "halyard_viewers", "investor_calls"]) expect((await one(`SELECT count(*)::int n FROM ${t}`)).n, t).toBe(0)
    expect((await one("SELECT count(*)::int n FROM halyard_prep")).n).toBe(1)           // preparation notes belong to the person, not to the call
  })
})

describe("the person's own export", () => {
  it("has everything of their calls, decrypted: consent record, transcript, brief, every notes version, suggestions, shares and preparation; and nobody else's", async () => {
    const s = await start({ title: "Mine" }); await addSegment(s, { seq: 0, channel: "them", text: "Our pipeline is five LOIs", startedMs: 0 }); await act(s, "say", {}, model)
    await saveNotes(s, { summary: "v1" } as any, "ai"); await saveNotes(s, { summary: "v2" } as any, "user")
    await db.query("INSERT INTO halyard_prep (org_id, user_id, mode, context_enc) VALUES ($1,$2,'general',$3)", [ORG, USER, encryptSecret("my prep")])
    await db.query("INSERT INTO halyard_sessions (org_id, user_id, state, consent_attested_at) VALUES ($1, 'someone-else', 'ended', now())", [ORG])
    const x = await exportPersonalData(ORG, USER)
    expect(x.sessions).toHaveLength(1); const e = x.sessions[0]
    expect(e).toMatchObject({ title: "Mine", consent: { participantsInformed: true, version: "v1" } }); expect(e.consent.attestedAt).toBeTruthy()
    expect(e.transcript.map((t) => t.text)).toEqual(["Our pipeline is five LOIs"]); expect((e.notes as any[]).map((n) => n.body.summary)).toEqual(["v1", "v2"]); expect(e.suggestions[0].text).toBe("Say it.")
    expect(x.preparation[0].text).toBe("my prep"); expect(JSON.stringify(x)).not.toMatch(/someone-else/); expect(x.note).toMatch(/Audio is never stored/)
    expect((await exportPersonalData(ORG, USER, "nope")).sessions).toEqual([])
  })
})

describe("transcription health without content", () => {
  it("records each provider attempt as a count and a timing, and drops them after 90 days", async () => {
    const s = await start(), put = (seq: number, t: () => Promise<string>) => ingestUtterance(s, { seq, channel: "room", startedMs: 0, endedMs: 2000, bytes: Buffer.from("x"), mime: "audio/wav" }, t).catch(() => null)
    await put(0, async () => `words ${MARK}`); await put(1, async () => { throw Object.assign(new Error("secret detail"), { status: 504 }) }); await put(2, async () => { throw Object.assign(new Error("none"), { status: 422 }) })
    const rows = (await db.query<any>("SELECT ok, reason FROM halyard_uploads ORDER BY id")).rows; expect(rows).toEqual([{ ok: true, reason: null }, { ok: false, reason: "http_504" }, { ok: true, reason: "no_speech" }])
    expect(JSON.stringify((await db.query("SELECT * FROM halyard_uploads")).rows)).not.toMatch(new RegExp(`${MARK}|secret|session`))
    await db.query("UPDATE halyard_uploads SET created_at = now() - interval '91 days' WHERE id = (SELECT min(id) FROM halyard_uploads)"); await sweepSessions(); expect((await one("SELECT count(*)::int n FROM halyard_uploads")).n).toBe(2)
  })
})

describe("what the platform sees", () => {
  it("is counts, timings and health only: a workspace's numbers appear, no content of any call does", async () => {
    await db.exec("CREATE TABLE IF NOT EXISTS organizations(id text PRIMARY KEY, name text); CREATE TABLE IF NOT EXISTS tenant_entitlements(org_id text PRIMARY KEY, features jsonb DEFAULT '{}')")
    await db.query("INSERT INTO organizations VALUES ($1, 'Acme GmbH') ON CONFLICT DO NOTHING", [ORG]); await db.query("INSERT INTO platform_flags (key, enabled) VALUES ('halyard_web', true) ON CONFLICT (key) DO UPDATE SET enabled = true")
    await db.exec("DELETE FROM tenant_entitlements"); await db.query("INSERT INTO tenant_entitlements (org_id, features) VALUES ($1, '{\"halyard\": false}')", [ORG])
    const s = await start({ title: `Secret title ${MARK}` }); await addSegment(s, { seq: 0, channel: "them", text: `Words ${MARK} said aloud`, audioSeconds: 600 }); await act(s, "say", {}, async () => ({ text: `Suggestion ${MARK}`, model: "m", error: null }))
    await saveNotes(s, { summary: `Notes ${MARK}` } as any, "user")
    const { halyardOverview } = await import("./supervision"); const o = await halyardOverview()
    expect(o.flagOn).toBe(true); expect(o.workspaces).toEqual([{ orgId: ORG, orgName: "Acme GmbH", sessions30d: 1, minutes30d: 10, suggestions30d: 1, liveNow: 1, featureOverride: false, retentionMonths: 12 }])
    expect(o.totals).toEqual({ sessions30d: 1, liveNow: 1, minutes30d: 10, suggestions30d: 1 }); expect(o.health.suggestions).toBe(1); expect(o.health.p95Ms).not.toBeNull()
    expect(JSON.stringify(o)).not.toMatch(new RegExp(`${MARK}|Secret title|Words|user-1`))
    const src = (await import("node:fs")).readFileSync("lib/halyard/supervision.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")
    for (const col of ["text_enc", "brief_enc", "figures_enc", "body_enc", "context_enc", "title", "transcript", "user_id", "crm_entry_id", "call_id"]) expect(src, `supervision.ts must not read ${col}`).not.toMatch(new RegExp(`\\b${col}\\b`))
  })
})
