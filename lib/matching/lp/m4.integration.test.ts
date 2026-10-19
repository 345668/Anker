import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"

const state = vi.hoisted(() => ({ query: vi.fn(), wave: vi.fn() }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))
vi.mock("@/lib/vc/lp-wave", () => ({ draftLpWave: state.wave, WAVE_PER_REQUEST: 10 }))

import { listMatches, getMatch, resolveNames, latestSession, sessionInWorkspace, listSessions, compareSessions, previousSessionId } from "./matches"
import { recordFeedback, clearExclusion, FeedbackError } from "./feedback"
import { addMatchesToCrm, removeAdded, draftIntros, previewAdd, MatchActionError } from "./actions"
import { refineLpMatch, type LpMatchDeps } from "./service"
import { loadLpRuleData } from "./rules-load"
import { buildLpRules } from "./rules"
import { CAPABILITIES, isProposeCapability } from "@/lib/actions/capabilities"
import { lpMatchExplain, lpMatchFeedback } from "@/lib/assistant/lp-match-tools"

let db: PGlite
const A = { orgId: "org-a", userId: "alice" }
const S1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", S2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb", FP = "11111111-1111-1111-1111-111111111111", FPB = "22222222-2222-2222-2222-222222222222"
const F1 = "f1111111-1111-1111-1111-111111111111", F2 = "f2222222-2222-2222-2222-222222222222", C1 = "c1111111-1111-1111-1111-111111111111", C2 = "c2222222-2222-2222-2222-222222222222", C3 = "c3333333-3333-3333-3333-333333333333", FB = "f3333333-3333-3333-3333-333333333333"
const principal: any = { userId: "alice", orgId: "org-a", persona: "vc", canWrite: true, readonly: false }

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => { try { return (await db.query(q, values)).rows } catch (e: any) { e.message += ` -- ${String(q).replace(/\s+/g, " ").slice(0, 240)}`; throw e } })
  await db.exec("CREATE TABLE organizations(id text PRIMARY KEY, kind text, fund_id text); CREATE TABLE memberships(user_id text, org_id text, persona text);")
  await db.exec(readFileSync("scripts/create-lp-tables.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-04-25-matching-v2.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-09-11-matching-profile-contract.sql", "utf8"))
  await db.exec("ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS expected_ticket_usd float8; ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS expected_ticket_usd float8, ADD COLUMN IF NOT EXISTS factor_capacity int;")
  await db.exec(readFileSync("scripts/migrations/2026-10-19-lp-match-workspace.sql", "utf8"))
  await db.exec("INSERT INTO organizations VALUES ('org-a','fund','fund-1'),('org-b','fund',NULL);")
  await db.exec(readFileSync("scripts/migrations/2026-10-19c-lp-match-explain-feedback.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-19d-lp-match-run-options.sql", "utf8"))
  await db.exec(`
    CREATE TABLE crm_boards(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), org_id text, user_id text, name text, source_session_id text, position int, archived boolean DEFAULT false);
    CREATE UNIQUE INDEX crm_boards_src ON crm_boards(org_id, source_session_id) WHERE source_session_id IS NOT NULL;
    CREATE TABLE crm_entries(id text PRIMARY KEY DEFAULT gen_random_uuid()::text, org_id text, user_id text, source text, source_session_id text, board_id uuid, import_key text, firm_id text, investor_id text,
      display_name text, display_title text, display_email text, display_linkedin text, display_location text, display_type text, display_score int, display_tier text, why_match text, stage text DEFAULT 'queued');
    CREATE UNIQUE INDEX crm_entries_imp ON crm_entries(org_id, import_key);
    CREATE TABLE outreach_messages(id serial PRIMARY KEY, crm_entry_id text); CREATE TABLE crm_tasks(id serial PRIMARY KEY, crm_entry_id text);
    CREATE TABLE investors(id text PRIMARY KEY, firm_id text);
    CREATE TABLE founder_match_exclusions(org_id text, entity_key text, reason text, created_by text, PRIMARY KEY (org_id, entity_key));
    CREATE TABLE match_outcome_events(id serial PRIMARY KEY, user_id text, event_type text, source text, subject_id text, firm_id text, investor_id text, match_score numeric, prev_stage text, new_stage text, metadata jsonb);
    CREATE TABLE email_suppressions(user_id text, email text); CREATE TABLE fund_lps(fund_id text, contact_email text, lp_name text);
    CREATE TABLE directory_sources(source text PRIMARY KEY, status text, permitted_use text[]); CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean);
  `)
})
afterAll(async () => db.close())
beforeEach(async () => {
  state.wave.mockReset()
  await db.exec(`DELETE FROM lp_match_feedback; DELETE FROM lp_firm_matches; DELETE FROM lp_contact_matches; DELETE FROM lp_match_sessions; DELETE FROM fund_profiles; DELETE FROM crm_entries; DELETE FROM crm_boards; DELETE FROM founder_match_exclusions; DELETE FROM match_outcome_events; DELETE FROM investors;`)
  await db.exec(`
    INSERT INTO fund_profiles(id,name,user_id,org_id,is_active) VALUES ('${FP}','Fund A','alice','org-a',true),('${FPB}','Fund B','bob','org-b',true);
    INSERT INTO lp_match_sessions(id,fund_profile_id,fund_name,user_id,org_id,status,filters_applied,created_at) VALUES
      ('${S1}','${FP}','Fund A','alice','org-a','completed','{"countries":["US"],"classes":["family_office"]}',now() - interval '1 hour'),
      ('${S2}','${FPB}','Fund B','bob','org-b','completed',NULL,now());
    INSERT INTO lp_firm_matches(id,session_id,fund_profile_id,firm_id,firm_name,firm_type,firm_location,firm_aum_usd,score,tier,tags,reasons,why_this_lp,factor_lp_type,factor_aum,factor_sector,factor_geo,factor_thesis_signals,stage,expected_ticket_usd,gaps,confidence) VALUES
      ('${F1}','${S1}','${FP}','FIRM1','Alpha Family Office','Family Office','New York',500000000,81,'champion','["FO"]','["Sector overlap: climate","Matches investment geography: US"]','Family Office in New York.',20,25,10,15,0,'identified',7000000,'[]','high'),
      ('${F2}','${S1}','${FP}','FIRM2','Beta Trust','Family Office','Boston',NULL,55,'priority_b','[]','["Sector overlap: ai"]','Family Office in Boston.',18,0,5,10,0,'identified',NULL,'["AUM not in the directory"]','low'),
      ('${FB}','${S2}','${FPB}','FIRMB','Other Workspace FO','Family Office','Paris',100000000,70,'priority_a','[]','[]','x',10,10,10,10,0,'identified',NULL,'[]','medium');
    INSERT INTO investors(id,firm_id) VALUES ('INV1','FIRM1'),('INV2','FIRM2'),('INV3','FIRM2');
    INSERT INTO lp_contact_matches(id,session_id,fund_profile_id,investor_id,contact_name,contact_title,contact_type,contact_location,contact_email,contact_linkedin,score,tier,tags,reasons,why_this_lp,factor_lp_type,factor_sector,factor_geo,factor_thesis_signals,factor_contact_quality,stage,gaps,confidence) VALUES
      ('${C1}','${S1}','${FP}','INV1','Pat One','Principal','Family Office','New York','pat@alpha.example','','72','priority_a','[]','["Email on record"]','Principal in New York.',20,5,10,0,14,'identified','[]','high'),
      ('${C2}','${S1}','${FP}','INV2','Sam Two','','Family Office','Boston','','https://www.linkedin.com/in/sam-two','60','priority_a','[]','[]','x',20,5,10,0,6,'identified','["Role not recorded"]','medium'),
      ('${C3}','${S1}','${FP}','INV3','Kim Three','','Family Office','Boston','','','50','priority_b','[]','[]','x',20,5,10,0,0,'identified','["No email or LinkedIn profile on record"]','low');
  `)
})

describe("reading a run", () => {
  it("lists a run's rows in score order, filtered, and only inside the workspace", async () => {
    const all = await listMatches("org-a", S1, { kind: "firm" })
    expect(all!.rows.map((r) => r.name)).toEqual(["Alpha Family Office", "Beta Trust"])
    expect(all!.total).toBe(2)
    expect((await listMatches("org-a", S1, { kind: "firm", tier: "champion" }))!.rows).toHaveLength(1)
    expect((await listMatches("org-a", S1, { kind: "firm", confidence: "low" }))!.rows[0].name).toBe("Beta Trust")
    expect((await listMatches("org-a", S1, { kind: "firm", q: "alp" }))!.rows[0].name).toBe("Alpha Family Office")
    expect(await listMatches("org-b", S1, { kind: "firm" })).toBeNull()
    expect(await listMatches("org-a", S2, { kind: "firm" })).toBeNull()
  })
  it("never returns a contact's address: only whether a way to reach them exists", async () => {
    const r = (await listMatches("org-a", S1, { kind: "contact" }))!.rows
    expect(r.map((x) => [x.name, x.hasEmail, x.hasLinkedIn])).toEqual([["Pat One", true, false], ["Sam Two", false, true], ["Kim Three", false, false]])
    expect(JSON.stringify(r)).not.toContain("pat@alpha.example")
    expect(JSON.stringify(r)).not.toContain("linkedin.com/in")
  })
  it("one match in full carries reasons, gaps, confidence and the engine's points; another workspace sees nothing", async () => {
    const m = await getMatch("org-a", "firm", F1)
    expect(m).toMatchObject({ name: "Alpha Family Office", confidence: "high", gaps: [], expectedTicket: 7000000, sessionId: S1 })
    expect(m!.reasons).toContain("Sector overlap: climate")
    expect(m!.factors[0]).toEqual({ key: "aum", label: "Size and likely cheque", points: 25 })
    expect(await getMatch("org-b", "firm", F1)).toBeNull()
  })
  it("finds the latest run and resolves names exactly, reporting the unknown and the ambiguous", async () => {
    expect((await latestSession("org-a"))!.id).toBe(S1)
    expect(await sessionInWorkspace("org-b", S1)).toBeNull()
    const r = await resolveNames("org-a", S1, ["alpha family office", "Nobody", "Pat One"])
    expect(r.refs.map((x) => [x.kind, x.name])).toEqual([["firm", "Alpha Family Office"], ["contact", "Pat One"]])
    expect(r.unresolved).toEqual(["Nobody"])
  })
})

describe("run history", () => {
  it("lists the workspace's finished runs, newest first, whoever started them, and nothing of another workspace", async () => {
    await db.exec(`INSERT INTO lp_match_sessions(id,fund_profile_id,fund_name,user_id,org_id,status,source,qualified_firms,created_at,run_options)
      VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd','${FP}','Fund A','bob','org-a','completed','assistant',9,now(),'{"minScore":30,"includeKnown":true}'),
             ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','${FP}','Fund A','alice','org-a','running','page',1,now(),NULL)`)
    const runs = await listSessions("org-a")
    expect(runs.map((r) => [r.id.slice(0, 4), r.source])).toEqual([["dddd", "assistant"], ["aaaa", "page"]]) // the running one is not a run yet
    expect(runs[0].options).toEqual({ minScore: 30, includeKnown: true })
    expect((await listSessions("org-b")).map((r) => r.id.slice(0, 4))).toEqual(["bbbb"])
    expect(await listSessions("org-a", { fundProfileId: FPB })).toEqual([])
  })
  it("finds the run before this one for the same fund, and compares two runs by firm", async () => {
    const S3 = "dddddddd-dddd-dddd-dddd-dddddddddddd", F3 = "f4444444-4444-4444-4444-444444444444"
    await db.exec(`INSERT INTO lp_match_sessions(id,fund_profile_id,fund_name,user_id,org_id,status,qualified_firms,qualified_contacts,created_at) VALUES ('${S3}','${FP}','Fund A','alice','org-a','completed',2,0,now());
      INSERT INTO lp_firm_matches(id,session_id,fund_profile_id,firm_id,firm_name,score,tier) VALUES ('${F3}','${S3}','${FP}','FIRM1','Alpha Family Office',80,'champion'),('f5555555-5555-5555-5555-555555555555','${S3}','${FP}','FIRM7','Newcomer FO',60,'priority_a')`)
    await db.exec(`UPDATE lp_match_sessions SET qualified_firms = 2 WHERE id = '${S1}'`)
    const s3 = await sessionInWorkspace("org-a", S3)
    expect(await previousSessionId("org-a", s3)).toBe(S1)
    expect(await previousSessionId("org-a", await sessionInWorkspace("org-a", S1))).toBeNull()
    const c = await compareSessions("org-a", S3, S1)
    expect(c).toMatchObject({ newCount: 1, droppedCount: 1, newFirms: ["Newcomer FO"], droppedFirms: ["Beta Trust"], firmsDelta: 0 })
    expect(await compareSessions("org-b", S3, S1)).toBeNull()
  })
})

describe("verdicts", () => {
  it("keeps a verdict, and 'never again' becomes an exclusion the next run honours", async () => {
    const r = await recordFeedback(A, { kind: "firm", matchId: F2, verdict: "not_a_fit", reason: "too_small", neverAgain: true })
    expect(r).toMatchObject({ entityKey: "firm:FIRM2", excluded: true, name: "Beta Trust" })
    const rules = buildLpRules(await loadLpRuleData(A, {}))
    expect(rules.firm({ id: "FIRM2", name: "x", source: null, norm_country: null })).toBe("saved")
    expect(rules.person({ id: "INV9", email: null, source: null, restricted_at: null, norm_country: null, firm_id: "FIRM2", name: "x" })).toBe("saved") // its people too
    const rows = (await listMatches("org-a", S1, { kind: "firm" }))!.rows
    expect(rows.find((x) => x.name === "Beta Trust")).toMatchObject({ verdict: "not_a_fit", excluded: true })
    expect((await listMatches("org-a", S1, { kind: "firm", hideJudged: true }))!.rows.map((x) => x.name)).toEqual(["Alpha Family Office"])
    const ev = (await db.query("SELECT event_type, source, subject_id FROM match_outcome_events")).rows
    expect(ev).toEqual([{ event_type: "declined", source: "lp_firm_match", subject_id: F2 }])
  })
  it("a verdict without 'never again' excludes nothing, and 'fit' never excludes", async () => {
    await recordFeedback(A, { kind: "firm", matchId: F1, verdict: "not_a_fit" })
    await recordFeedback(A, { kind: "contact", matchId: C1, verdict: "fit", neverAgain: true })
    expect((await db.query<any>("SELECT count(*)::int n FROM founder_match_exclusions")).rows[0].n).toBe(0)
  })
  it("can be lifted, and only inside the workspace", async () => {
    await recordFeedback(A, { kind: "firm", matchId: F2, verdict: "wrong_data", neverAgain: true })
    expect(await clearExclusion({ orgId: "org-a" }, "firm", F2)).toBe(true)
    expect(await clearExclusion({ orgId: "org-a" }, "firm", F2)).toBe(false)
    await expect(recordFeedback({ orgId: "org-b", userId: "bob" }, { kind: "firm", matchId: F1, verdict: "fit" })).rejects.toMatchObject({ status: 404 })
    await expect(recordFeedback(A, { kind: "firm", matchId: F1, verdict: "nope" as any })).rejects.toBeInstanceOf(FeedbackError)
    await expect(recordFeedback(A, { kind: "firm", matchId: F1, verdict: "fit", reason: "bogus" })).rejects.toBeInstanceOf(FeedbackError)
  })
})

describe("putting LPs in the CRM", () => {
  it("adds firms and reachable people to a board, once, and says what it left", async () => {
    const r = await addMatchesToCrm(A, S1, [{ kind: "firm", id: F1 }, { kind: "contact", id: C1 }, { kind: "contact", id: C2 }, { kind: "contact", id: C3 }])
    expect(r.added.map((x) => x.name).sort()).toEqual(["Alpha Family Office", "Pat One", "Sam Two"])
    expect(r.skipped).toEqual([{ name: "Kim Three", reason: "no email or LinkedIn profile to reach them by" }])
    expect(r.boardName).toBe("LP matches: Fund A")
    const e = (await db.query("SELECT display_name, source, stage, display_email, investor_id, firm_id FROM crm_entries WHERE display_name='Pat One'")).rows[0]
    expect(e).toMatchObject({ source: "lp_matching", stage: "queued", display_email: "pat@alpha.example", investor_id: "INV1" })
    const again = await addMatchesToCrm(A, S1, [{ kind: "contact", id: C1 }, { kind: "firm", id: F1 }])
    expect(again.added).toEqual([])
    expect(again.already.map((x) => x.name).sort()).toEqual(["Alpha Family Office", "Pat One"])
    expect((await db.query<any>("SELECT count(*)::int n FROM crm_entries")).rows[0].n).toBe(3)
  })
  it("refuses a run of another workspace, an empty choice and more than fifty", async () => {
    await expect(addMatchesToCrm({ orgId: "org-b", userId: "bob" }, S1, [{ kind: "firm", id: F1 }])).rejects.toMatchObject({ status: 404 })
    await expect(addMatchesToCrm(A, S1, [])).rejects.toBeInstanceOf(MatchActionError)
    await expect(addMatchesToCrm(A, S1, Array.from({ length: 51 }, () => ({ kind: "firm" as const, id: F1 })))).rejects.toBeInstanceOf(MatchActionError)
    expect((await previewAdd("org-a", S1, [{ kind: "firm", id: FB }])).fresh).toHaveLength(0) // another workspace's row is simply not found
  })
  it("the governed action previews exactly what it will add, applies it, and undoes it only while untouched", async () => {
    const cap = CAPABILITIES.lp_match_to_crm
    expect(cap.risk).toBe("R1")
    // The tool and the capability share one name, or executeTool would run the tool's stub instead of proposing.
    expect(isProposeCapability("lp_match_to_crm")).toBe(true)
    expect(() => cap.check({})).toThrow(/Name the LPs/)
    await expect(cap.plan(A, { names: ["Nobody"] })).rejects.toThrow(/Not found in the run: Nobody/)
    const plan = await cap.plan(A, { names: ["Alpha Family Office", "Pat One"] })
    expect(plan.summary).toBe("Add 2 suggested LPs to the CRM")
    expect(plan.bind).toMatchObject({ sessionId: S1, names: [] })
    const input = { ...cap.check({ names: ["Alpha Family Office", "Pat One"] }), ...plan.bind }
    const applied = await cap.apply(A, input)
    expect(applied.message).toMatch(/Added 2 to the CRM board "LP matches: Fund A"/)
    await expect(cap.plan(A, input)).rejects.toThrow(/already in your CRM/)
    const undone = await cap.undo(A, input, applied.undo)
    expect(undone).toMatch(/Removed 2/)
    const again = await cap.apply(A, input)
    await db.exec("UPDATE crm_entries SET stage = 'contacted'")
    await expect(cap.undo(A, input, again.undo)).rejects.toThrow(/worked on/)
    expect(await removeAdded("org-a", [])).toBe(0)
  })
})

describe("drafts for chosen people", () => {
  it("puts them in the CRM and asks the wave for exactly those entries; firms are skipped with the reason", async () => {
    state.wave.mockResolvedValue({ proposed: 2, skipped: [], remainingToday: 20, stoppedAtLimit: false, considered: 2 })
    const r = await draftIntros({ ...A, persona: "vc" }, S1, [{ kind: "contact", id: C1 }, { kind: "contact", id: C2 }, { kind: "firm", id: F1 }])
    expect(r.proposed).toBe(2)
    const ids = state.wave.mock.calls[0][3] as string[]
    expect(ids).toHaveLength(2)
    expect((await db.query("SELECT display_name FROM crm_entries WHERE id = ANY($1::text[]) ORDER BY 1", [ids])).rows.map((x: any) => x.display_name)).toEqual(["Pat One", "Sam Two"])
    expect(r.skipped).toEqual([{ name: "A firm", reason: "choose a person at the firm: a draft is written to a person" }])
    await expect(draftIntros({ ...A, persona: "vc" }, S1, [{ kind: "firm", id: F1 }])).rejects.toThrow(/Choose people/)
  })
})

describe("refining a run", () => {
  it("runs again from the last run's mandate with the change applied, saves it as a child, and reports who is new and who dropped", async () => {
    let seen: any = null
    const deps: LpMatchDeps = {
      run: (async (_fund: any, opts: any) => { seen = opts; return { sessionId: "cccccccc-cccc-cccc-cccc-cccccccccccc", fundProfileId: FP, fundName: "Fund A", totals: {}, tierCounts: {}, segmentCounts: {}, funnel: {}, contacts: [],
        firms: [{ firmId: "FIRM1", name: "Alpha Family Office" }, { firmId: "FIRM9", name: "Newcomer FO" }] } }) as any,
      save: vi.fn() as any, loadRules: async () => ({ keys: new Map(), emails: new Set(), yoursEmails: new Set(), yoursNames: new Set(), sources: new Map(), gateOn: false, excludedCountries: new Set() }),
    }
    await db.exec(`UPDATE fund_profiles SET target_raise=40000000, sectors='["climate"]', geographic_focus='["united states"]', headquarters_location='NYC' WHERE id='${FP}'`)
    const out = await refineLpMatch({ ...A, source: "assistant" }, { changes: { countries: ["DE"] } }, deps)
    expect(seen.filters).toMatchObject({ countries: ["DE"], classes: ["family_office"] }) // the country replaced, the class kept
    expect(out.addedFirms).toEqual(["Newcomer FO"])
    expect(out.droppedFirms).toEqual(["Beta Trust"])
    expect(deps.save).toHaveBeenCalledWith(expect.anything(), "alice", expect.objectContaining({ orgId: "org-a", source: "assistant", parentSessionId: S1 }))
  })
  it("says so when there is nothing to refine", async () => {
    await db.exec("DELETE FROM lp_match_sessions WHERE org_id = 'org-a'")
    await expect(refineLpMatch({ ...A, source: "assistant" }, { changes: { countries: ["DE"] } })).rejects.toMatchObject({ status: 409 })
  })
})

describe("the assistant's follow-up tools", () => {
  it("explains one LP from what the run holds, and does not guess a missing one", async () => {
    const out = await lpMatchExplain({ name: "Beta Trust" }, principal)
    expect(out.observation).toContain("Confidence: Low. Not known: AUM not in the directory")
    expect(out.observation).toContain("Likely cheque: not estimated")
    expect(out.observation).toContain("Reasons the engine gave: Sector overlap: ai")
    expect((await lpMatchExplain({ name: "Zeta" }, principal)).observation).toMatch(/not in run/)
    expect((await lpMatchExplain({ name: "Beta Trust" }, { ...principal, persona: "founder" })).observation).toMatch(/fund workspace/)
  })
  it("records a verdict for named LPs, refuses a read-only member, and reports the names it could not find", async () => {
    const out = await lpMatchFeedback({ names: ["Beta Trust", "Ghost"], verdict: "not_a_fit", reason: "too_small", neverAgain: true }, principal)
    expect(out.observation).toContain('Recorded "not_a_fit" (too_small) for 1: Beta Trust.')
    expect(out.observation).toContain("will not be suggested again")
    expect(out.observation).toContain("Not found in the run: Ghost")
    expect((await lpMatchFeedback({ names: ["Beta Trust"], verdict: "fit" }, { ...principal, canWrite: false })).observation).toMatch(/read-only/)
    expect((await lpMatchFeedback({ names: ["Beta Trust"], verdict: "maybe" }, principal)).observation).toMatch(/verdict must be/)
  })
})
