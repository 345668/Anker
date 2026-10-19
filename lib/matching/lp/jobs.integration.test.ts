import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn(), deliver: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))
vi.mock("./delivery", async (orig) => ({ ...(await orig<typeof import("./delivery")>()), deliverRun: state.deliver }))

import { startLpMatch, processLpSession, runWithHandoff, runLpMatch, sweepLpSessions, sessionStatus, activeSession, LpMatchError, MAX_ATTEMPTS, type LpMatchDeps } from "./service"
import { wordsFor } from "./delivery"
import type { ProgressEvent } from "@/lib/matching/v2/types"

let db: PGlite
const FP = "11111111-1111-1111-1111-111111111111"
const scope = { orgId: "org-a", userId: "alice", source: "page" as const }
const emptyRules = async () => ({ keys: new Map(), emails: new Set<string>(), yoursEmails: new Set<string>(), yoursNames: new Set<string>(), sources: new Map(), gateOn: false, excludedCountries: new Set<string>() })
const fakeResult = (sessionId: string) => ({ sessionId, fundProfileId: FP, fundName: "Fund A", ranAt: "x", durationMs: 5, funnel: { firms: [], contacts: [] }, totals: { rawFirms: 10, rawContacts: 20, qualifiedFirms: 2, qualifiedContacts: 1, contactsWithEmail: 1, anchorCandidates: 0, duplicatesMerged: 0, aiEnrichmentsApplied: 0 }, tierCounts: {}, segmentCounts: {}, firms: [], contacts: [] })
/** An engine that reports progress, can be slow, and can fail. */
const engine = (over: { delayMs?: number; fail?: () => Error | null; events?: ProgressEvent[] } = {}) => {
  const run = vi.fn(async (_fund: any, opts: any) => {
    for (const e of over.events ?? [{ phase: "loading", message: "Loading firms from database…" } as ProgressEvent, { phase: "scoring", entity: "firms", processed: 100, total: 200 } as ProgressEvent]) opts.onProgress?.(e)
    if (over.delayMs) await new Promise((r) => setTimeout(r, over.delayMs))
    const err = over.fail?.(); if (err) throw err
    return fakeResult(opts.sessionId)
  })
  // The real save writes the results into the row; here only the row's counts matter.
  const save = vi.fn(async (r: any) => { await db.query("UPDATE lp_match_sessions SET qualified_firms = $2, qualified_contacts = $3 WHERE id::text = $1", [r.sessionId, r.totals.qualifiedFirms, r.totals.qualifiedContacts]) })
  const deps: LpMatchDeps = { run: run as any, save: save as any, loadRules: emptyRules }
  return { run, save, deps }
}
const row = async (id: string) => (await db.query<any>("SELECT * FROM lp_match_sessions WHERE id::text = $1", [id])).rows[0]
const fresh = async (over = "") => (await startLpMatch(scope, { fundProfileId: FP, mandate: { countries: ["us"] }, ...(over ? JSON.parse(over) : {}) })).sessionId

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec("CREATE TABLE organizations(id text PRIMARY KEY, kind text, fund_id text); CREATE TABLE memberships(user_id text, org_id text, persona text);")
  await db.exec(readFileSync("scripts/create-lp-tables.sql", "utf8"))
  for (const f of ["2026-04-25-matching-v2", "2026-09-11-matching-profile-contract"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  await db.exec("ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS expected_ticket_usd float8; ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS expected_ticket_usd float8, ADD COLUMN IF NOT EXISTS factor_capacity int;")
  for (const f of ["2026-10-19-lp-match-workspace", "2026-10-19c-lp-match-explain-feedback", "2026-10-19d-lp-match-run-options", "2026-10-19e-lp-match-jobs", "2026-10-19f-lp-match-status-check", "2026-10-19g-lp-match-one-open-run"]) {
    if (f === "2026-10-19c-lp-match-explain-feedback") await db.exec("INSERT INTO organizations VALUES ('org-a','fund','fund-1'),('org-b','fund',NULL);")
    await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  }
  await db.exec("CREATE TABLE notifications(id serial PRIMARY KEY); CREATE TABLE telegram_links(id serial PRIMARY KEY);")
})
afterAll(async () => db.close())
beforeEach(async () => {
  state.deliver.mockReset(); state.deliver.mockResolvedValue(true)
  await db.exec(`DELETE FROM lp_firm_matches; DELETE FROM lp_contact_matches; DELETE FROM lp_match_sessions; DELETE FROM fund_profiles;
    INSERT INTO fund_profiles(id,name,target_raise,sectors,geographic_focus,headquarters_location,user_id,org_id,is_active,updated_at) VALUES ('${FP}','Fund A',40000000,'["climate"]','["united states"]','Berlin','alice','org-a',true,now());`)
})

describe("starting a run", () => {
  it("writes it as queued with everything the worker needs, and computes nothing", async () => {
    const e = engine()
    const id = await fresh()
    const r = await row(id)
    expect(r).toMatchObject({ status: "queued", org_id: "org-a", user_id: "alice", source: "page", fund_name: "Fund A", attempts: 0, handed_off: false })
    expect(r.filters_applied).toMatchObject({ countries: ["US"] })
    expect(r.run_options).toMatchObject({ includeKnown: false })
    expect(r.progress).toMatchObject({ phase: "queued", pct: 0 })
    expect(r.inputs_hash).toHaveLength(32)
    expect(e.run).not.toHaveBeenCalled()
  })
  it("refuses a request that cannot run, before anything is written", async () => {
    await expect(startLpMatch({ ...scope, orgId: "org-b" }, {})).rejects.toMatchObject({ status: 409 })
    await db.exec(`UPDATE fund_profiles SET headquarters_location = NULL`)
    await expect(startLpMatch(scope, {})).rejects.toMatchObject({ status: 422, missingFields: expect.any(Array) })
    expect((await db.query<any>("SELECT count(*)::int n FROM lp_match_sessions")).rows[0].n).toBe(0)
  })
  it("a repeat of a run still queued or running, or finished in the last half minute, is that run; a later repeat is a new one", async () => {
    const a = await fresh()
    expect(await fresh()).toBe(a)                                          // a double click
    await db.query("UPDATE lp_match_sessions SET status = 'running' WHERE id::text = $1", [a])
    expect(await fresh()).toBe(a)
    await db.query("UPDATE lp_match_sessions SET status = 'completed', finished_at = now() WHERE id::text = $1", [a])
    expect(await fresh()).toBe(a)                                          // just finished
    await db.query("UPDATE lp_match_sessions SET finished_at = now() - interval '31 seconds' WHERE id::text = $1", [a])
    const b = await fresh()
    expect(b).not.toBe(a)                                                  // the CRM may have changed the answer
    expect(await fresh(JSON.stringify({ mandate: { countries: ["de"] } }))).not.toBe(b)   // a different mandate is a different run
    await db.exec("UPDATE fund_profiles SET updated_at = now() + interval '1 minute'")
    expect(await fresh()).not.toBe(b)                                      // the profile changed
  })
})

describe("doing the work", () => {
  it("claims the run, reports progress and heartbeat, saves into the same row and completes it", async () => {
    const e = engine({ delayMs: 20 })
    const id = await fresh()
    const out = await processLpSession(id, e.deps)
    expect(out!.result.sessionId).toBe(id)
    const [fundArg, optsArg] = e.run.mock.calls[0]
    expect(fundArg.name).toBe("Fund A"); expect(optsArg.sessionId).toBe(id); expect(optsArg.filters).toMatchObject({ countries: ["US"] }); expect(typeof optsArg.rules.firm).toBe("function")
    expect(e.save).toHaveBeenCalledWith(expect.objectContaining({ sessionId: id }), "alice", expect.objectContaining({ sessionId: id, orgId: "org-a", source: "page" }))
    const r = await row(id)
    expect(r).toMatchObject({ status: "completed", attempts: 1, qualified_firms: 2, error: null })
    expect(r.progress).toMatchObject({ phase: "done", pct: 100 })
    expect(r.started_at).toBeTruthy(); expect(r.finished_at).toBeTruthy(); expect(r.heartbeat_at).toBeTruthy()
    expect(state.deliver).not.toHaveBeenCalled()   // nobody stopped waiting, so nobody is told
  })
  it("writes the engine's position while it works", async () => {
    const seen: any[] = []
    const e = engine({ delayMs: 10 })
    const orig = e.run.getMockImplementation()!
    e.run.mockImplementation(async (f: any, o: any) => { const p = orig(f, o); await new Promise((r) => setTimeout(r, 5)); seen.push((await row(o.sessionId)).progress); return p })
    const id = await fresh()
    await processLpSession(id, e.deps)
    expect(seen[0]).toMatchObject({ phase: "scoring", label: "Scoring firms (100 of 200)" })   // the engine's position was on the row before it finished
  })
  it("only one worker takes a run", async () => {
    const e = engine({ delayMs: 30 })
    const id = await fresh()
    const [a, b] = await Promise.all([processLpSession(id, e.deps), processLpSession(id, e.deps)])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(e.run).toHaveBeenCalledTimes(1)
    expect(await processLpSession(id, e.deps)).toBeNull()   // and a finished run is not taken again
  })
  it("a failure puts the run back for the sweep, three failures end it, and the error is thrown to whoever waited", async () => {
    const e = engine({ fail: () => new Error("database blip") })
    const id = await fresh()
    await expect(processLpSession(id, e.deps)).rejects.toThrow("database blip")
    expect(await row(id)).toMatchObject({ status: "queued", attempts: 1, error: "database blip" })
    await expect(processLpSession(id, e.deps)).rejects.toThrow()
    await expect(processLpSession(id, e.deps)).rejects.toThrow()
    expect(await row(id)).toMatchObject({ status: "failed", attempts: MAX_ATTEMPTS })
    expect((await row(id)).finished_at).toBeTruthy()
  })
  it("a refusal that trying again cannot change ends the run at once", async () => {
    const e = engine()
    const id = await fresh()
    await db.exec(`UPDATE fund_profiles SET is_active = false`)
    await expect(processLpSession(id, e.deps)).rejects.toBeInstanceOf(LpMatchError)
    expect(await row(id)).toMatchObject({ status: "failed", attempts: 1 })
    expect(e.run).not.toHaveBeenCalled()
  })
  it("a second attempt starts clean: what a dead worker half-wrote is removed", async () => {
    const e = engine()
    const id = await fresh()
    await db.query("UPDATE lp_match_sessions SET attempts = 1 WHERE id::text = $1", [id])
    await db.query(`INSERT INTO lp_firm_matches(id,session_id,fund_profile_id,firm_id,firm_name,score,tier) VALUES (gen_random_uuid(),$1,$2,'X','Half written',50,'priority_b')`, [id, FP])
    await processLpSession(id, e.deps)
    expect((await db.query<any>("SELECT count(*)::int n FROM lp_firm_matches WHERE session_id::text = $1", [id])).rows[0].n).toBe(0)
  })
})

describe("the sweep", () => {
  const age = (id: string, sql: string) => db.query(`UPDATE lp_match_sessions SET ${sql} WHERE id::text = $1`, [id])
  it("puts back a run whose worker stopped, fails one that has used its tries, and leaves a live one alone", async () => {
    const e = engine()
    const lost = await fresh(), spent = await fresh(JSON.stringify({ mandate: { countries: ["de"] } })), live = await fresh(JSON.stringify({ mandate: { countries: ["fr"] } }))
    await age(lost, "status = 'running', attempts = 1, heartbeat_at = now() - interval '2 minutes', created_at = now() - interval '5 minutes'")
    await age(spent, `status = 'running', attempts = ${MAX_ATTEMPTS}, heartbeat_at = now() - interval '2 minutes'`)
    await age(live, "status = 'running', attempts = 1, heartbeat_at = now() - interval '10 seconds'")
    const st = await sweepLpSessions(e.deps)
    expect(st).toMatchObject({ resumed: 1, failed: 1, started: 1 })
    expect(await row(lost)).toMatchObject({ status: "completed", attempts: 2 })     // resumed and done in the same sweep
    expect(await row(spent)).toMatchObject({ status: "failed", error: "The run did not finish after three tries." })
    expect((await row(live)).status).toBe("running")
  })
  it("starts a run nobody took up, but not one that was only just asked for", async () => {
    const e = engine()
    const old = await fresh(), recent = await fresh(JSON.stringify({ mandate: { countries: ["gb"] } }))
    await age(old, "created_at = now() - interval '40 seconds'")
    const st = await sweepLpSessions(e.deps)
    expect(st.started).toBe(1)
    expect((await row(old)).status).toBe("completed")
    expect((await row(recent)).status).toBe("queued")
  })
  it("sends the message for a handed-off run that finished without one, once", async () => {
    const e = engine()
    const id = await fresh()
    await age(id, "status = 'completed', handed_off = true, finished_at = now() - interval '2 minutes'")
    await sweepLpSessions(e.deps)
    expect(state.deliver).toHaveBeenCalledWith(id)
    const old = await fresh(JSON.stringify({ mandate: { countries: ["it"] } }))
    await age(old, "status = 'completed', handed_off = true, finished_at = now() - interval '3 hours'")
    state.deliver.mockClear(); await sweepLpSessions(e.deps)
    expect(state.deliver).not.toHaveBeenCalledWith(old)   // an old one is not announced hours later
  })
})

describe("waiting a little, then letting go", () => {
  it("a run that finishes in time is returned as done and nothing is handed off", async () => {
    const e = engine({ delayMs: 10 })
    const h = await runWithHandoff(scope, { fundProfileId: FP }, { waitMs: 2000, deps: e.deps, keepAlive: () => {} })
    expect(h.kind).toBe("done")
    expect((await row(h.sessionId)).handed_off).toBe(false)
  })
  it("a slow run is handed off, keeps going, and the person is told when it ends", async () => {
    const e = engine({ delayMs: 250 })
    let held: Promise<unknown> | null = null
    const h = await runWithHandoff({ ...scope, channel: "telegram" }, { fundProfileId: FP }, { waitMs: 40, deps: e.deps, keepAlive: (p) => { held = p } })
    expect(h.kind).toBe("running")
    const r0 = await row(h.sessionId)
    expect(r0).toMatchObject({ handed_off: true, notify: { channel: "telegram" } })
    expect(["queued", "running"]).toContain(r0.status)
    await held
    expect((await row(h.sessionId)).status).toBe("completed")
    expect(state.deliver).toHaveBeenCalledWith(h.sessionId)
  })
  it("a run that fails after it was handed off is announced as failed", async () => {
    const e = engine({ delayMs: 80, fail: () => new LpMatchError("The fund profile for this run is gone.", 404) })
    let held: Promise<unknown> | null = null
    const h = await runWithHandoff(scope, { fundProfileId: FP }, { waitMs: 10, deps: e.deps, keepAlive: (p) => { held = p } })
    expect(h.kind).toBe("running")
    await held
    expect((await row(h.sessionId)).status).toBe("failed")
    expect(state.deliver).toHaveBeenCalledWith(h.sessionId)
  })
  it("a run that fails while the caller waits is thrown at once", async () => {
    const e = engine({ fail: () => new LpMatchError("nope", 422) })
    await expect(runWithHandoff(scope, { fundProfileId: FP }, { waitMs: 1000, deps: e.deps, keepAlive: () => {} })).rejects.toMatchObject({ status: 422 })
  })
  it("the all-the-way variant returns the outcome, and a repeat that is already running waits for it", async () => {
    const e = engine({ delayMs: 60 })
    const [a, b] = await Promise.all([runLpMatch(scope, { fundProfileId: FP }, e.deps), runLpMatch(scope, { fundProfileId: FP }, e.deps)])
    expect(e.run).toHaveBeenCalledTimes(1)
    expect(a.result.sessionId).toBe(b.result.sessionId)
  })
})

describe("watching a run", () => {
  it("reports status inside the workspace only, and finds the one still going", async () => {
    const id = await fresh()
    expect(await sessionStatus("org-a", id)).toMatchObject({ id, status: "queued", fundName: "Fund A", source: "page" })
    expect(await sessionStatus("org-b", id)).toBeNull()
    expect(await activeSession("org-a")).toMatchObject({ id, status: "queued" })
    expect(await activeSession("org-b")).toBeNull()
    await db.query("UPDATE lp_match_sessions SET status = 'completed' WHERE id::text = $1", [id])
    expect(await activeSession("org-a")).toBeNull()
    await db.query("UPDATE lp_match_sessions SET status = 'running', created_at = now() - interval '20 minutes' WHERE id::text = $1", [id])
    expect(await activeSession("org-a")).toBeNull()   // a run that old is not "in progress"; the sweep deals with it
  })
})

describe("telling the person", () => {
  it("says what happened in counts, never names", () => {
    expect(wordsFor({ status: "completed", fund_name: "Fund A", qualified_firms: 383, qualified_contacts: 576, exclusion_counts: { total: 5, inCrm: 5 } }))
      .toEqual({ ok: true, title: "LP matching for Fund A is ready", body: "383 firms and 576 people qualified. 5 were left out by your rules (5 already in your CRM). Open the Matchmaking page for the ranked list." })
    expect(wordsFor({ status: "failed", fund_name: "Fund A" }).ok).toBe(false)
  })
  it("leaves a notification in the app, adds Telegram only for a run asked for there, and does it once", async () => {
    const { deliverRun: realDeliver } = await vi.importActual<typeof import("./delivery")>("./delivery")
    const inApp = vi.fn(async () => ({})), telegram = vi.fn(async () => 1)
    const mk = async (notify: string | null) => {
      const id = await fresh(JSON.stringify({ mandate: { countries: [Math.random().toString(36).slice(2, 4)] } }))
      await db.query("UPDATE lp_match_sessions SET status = 'completed', handed_off = true, qualified_firms = 3, qualified_contacts = 4, notify = $2::jsonb WHERE id::text = $1", [id, notify])
      return id
    }
    const web = await mk(null)
    expect(await realDeliver(web, { inApp, telegram })).toBe(true)
    expect(inApp).toHaveBeenCalledWith(expect.objectContaining({ userId: "alice", orgId: "org-a", href: "/dashboard/matchmaking", key: `lpm:${web}` }))
    expect(telegram).not.toHaveBeenCalled()
    expect(await realDeliver(web, { inApp, telegram })).toBe(false)   // once
    const tg = await mk(JSON.stringify({ channel: "telegram" }))
    await realDeliver(tg, { inApp, telegram })
    expect(telegram).toHaveBeenCalledWith(expect.objectContaining({ orgId: "org-a", userId: "alice", url: expect.stringContaining("/dashboard/matchmaking"), html: expect.stringContaining("3 firms and 4 people qualified") }))
    const notHanded = await fresh(JSON.stringify({ mandate: { countries: ["zz"] } }))
    await db.query("UPDATE lp_match_sessions SET status = 'completed' WHERE id::text = $1", [notHanded])
    expect(await realDeliver(notHanded, { inApp, telegram })).toBe(false)   // a run nobody stopped waiting for is not announced
  })
})
