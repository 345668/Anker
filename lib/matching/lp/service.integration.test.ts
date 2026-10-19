import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { NextRequest } from "next/server"

const state = vi.hoisted(() => ({ query: vi.fn(), org: "org-a", user: "alice" }))
vi.mock("@/lib/db", () => ({ sql: Object.assign((strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values), { unsafe: (q: string, values: unknown[]) => state.query(q, values) }) }))
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: state.user } } }) } }) }))
vi.mock("@/lib/org/active", () => ({ resolveActiveMembership: async () => ({ active: { orgId: state.org, persona: "vc" } }) }))

import { runLpMatch, resolveFundProfile, applyFundRules, LpMatchError, type LpMatchDeps } from "./service"
import { runLpMatchingV2 } from "@/lib/matching/v2/engine"
import { saveSessionV2 } from "@/lib/matching/v2/persistence"
import { loadLpRuleData } from "./rules-load"
import { buildLpRules } from "./rules"
import { authorizedSession } from "@/lib/matching/access"
import { EMPTY_FILTERS } from "@/lib/matching/filters"
import { toFundProfile } from "@/lib/matching/fund-profile"

let db: PGlite
const run = vi.fn(), save = vi.fn()
const deps = (): LpMatchDeps => ({ run: run as any, save: save as any, loadRules: loadLpRuleData })
const scope = { orgId: "org-a", userId: "alice", source: "assistant" as const }

beforeAll(async () => {
  db = new PGlite()
  state.query.mockImplementation(async (q, values) => (await db.query(q, values)).rows)
  await db.exec("CREATE TABLE organizations(id text PRIMARY KEY, kind text, fund_id text); CREATE TABLE memberships(user_id text, org_id text, persona text);")
  await db.exec(readFileSync("scripts/create-lp-tables.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-04-25-matching-v2.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-09-11-matching-profile-contract.sql", "utf8"))
  await db.exec("ALTER TABLE lp_firm_matches ADD COLUMN IF NOT EXISTS expected_ticket_usd float8; ALTER TABLE lp_contact_matches ADD COLUMN IF NOT EXISTS expected_ticket_usd float8, ADD COLUMN IF NOT EXISTS factor_capacity int;")
  const m = readFileSync("scripts/migrations/2026-10-19-lp-match-workspace.sql", "utf8")
  await db.exec(m); await db.exec(m) // repeatable
  const c = readFileSync("scripts/migrations/2026-10-19c-lp-match-explain-feedback.sql", "utf8")
  await db.exec(c); await db.exec(c)
  await db.exec(readFileSync("scripts/migrations/2026-10-19d-lp-match-run-options.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-19e-lp-match-jobs.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-19f-lp-match-status-check.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-19g-lp-match-one-open-run.sql", "utf8"))
  await db.exec(`
    CREATE TABLE crm_entries(id serial PRIMARY KEY, org_id text, firm_id text, investor_id text, stage text);
    CREATE TABLE founder_match_exclusions(org_id text, entity_key text, reason text, created_by text);
    CREATE TABLE email_suppressions(user_id text, email text);
    CREATE TABLE fund_lps(id serial PRIMARY KEY, fund_id text, contact_email text, lp_name text);
    CREATE TABLE directory_sources(source text PRIMARY KEY, status text, permitted_use text[]);
    CREATE TABLE platform_flags(key text PRIMARY KEY, enabled boolean);
    INSERT INTO organizations VALUES ('org-a','fund','fund-1'),('org-b','fund',NULL);
  `)
})
afterAll(async () => db.close())
beforeEach(async () => {
  run.mockReset(); save.mockReset()
  await db.exec("DELETE FROM fund_profiles; DELETE FROM crm_entries; DELETE FROM founder_match_exclusions; DELETE FROM email_suppressions; DELETE FROM fund_lps; DELETE FROM directory_sources; DELETE FROM lp_match_sessions;")
  run.mockResolvedValue({ sessionId: "00000000-0000-0000-0000-000000000001", totals: {}, tierCounts: {}, segmentCounts: {}, funnel: {}, firms: [], contacts: [] })
  save.mockResolvedValue(undefined)
})
const profile = (id: string, org: string, over = "") => db.exec(`INSERT INTO fund_profiles(id,name,target_raise,sectors,geographic_focus,headquarters_location,user_id,org_id,is_active,updated_at${over ? ",allowed_lp_classes,excluded_jurisdictions" : ""})
  VALUES ('${id}','Fund ${id}',40000000,'["climate"]','["united states"]','Berlin','alice','${org}',true,now()${over ? "," + over : ""})`)

describe("the shared LP service", () => {
  it("resolves the fund profile inside the workspace only", async () => {
    await profile("11111111-1111-1111-1111-111111111111", "org-a")
    expect((await resolveFundProfile({ orgId: "org-a" }))?.name).toBe("Fund 11111111-1111-1111-1111-111111111111")
    expect(await resolveFundProfile({ orgId: "org-b" })).toBeNull()
    expect(await resolveFundProfile({ orgId: "org-b" }, "11111111-1111-1111-1111-111111111111")).toBeNull()
  })
  it("says what is missing, and refuses a workspace without a profile", async () => {
    await expect(runLpMatch({ ...scope, orgId: "org-b" }, {}, deps())).rejects.toMatchObject({ status: 409 })
    await db.exec("INSERT INTO fund_profiles(id,name,user_id,org_id,is_active) VALUES ('22222222-2222-2222-2222-222222222222','Draft','alice','org-a',true)")
    await expect(runLpMatch(scope, {}, deps())).rejects.toMatchObject({ status: 422, missingFields: expect.any(Array) })
    expect(run).not.toHaveBeenCalled()
  })
  it("runs with the workspace's rules, saves the run to the workspace with its source, and passes the mandate on", async () => {
    await profile("33333333-3333-3333-3333-333333333333", "org-a")
    await db.exec(`INSERT INTO crm_entries(org_id,firm_id,investor_id,stage) VALUES ('org-a','f1',NULL,'contacted'),('org-a','f2',NULL,'queued'),('org-a','f3',NULL,'passed'),('org-b','f9',NULL,'contacted');
      INSERT INTO founder_match_exclusions VALUES ('org-a','firm:f4','no','alice');
      INSERT INTO email_suppressions VALUES ('alice','nope@x.com'),(NULL,'global@x.com');
      INSERT INTO fund_lps(fund_id,contact_email,lp_name) VALUES ('fund-1','mine@x.com','Acme Capital'),('fund-2','other@x.com','Elsewhere');`)
    await runLpMatch(scope, { mandate: { classes: ["family_office"], countries: ["us"] } }, deps())
    const [fund, opts] = run.mock.calls[0]
    expect(fund).toMatchObject({ name: "Fund 33333333-3333-3333-3333-333333333333", headquartersLocation: "Berlin" })
    const rules = buildLpRules(await loadLpRuleData(scope, {}))
    expect(opts.filters).toMatchObject({ classes: ["family_office"], countries: ["US"] })
    expect(rules.firm({ id: "f1", name: "x", source: null, norm_country: null })).toBe("inCrm")
    expect(rules.firm({ id: "f2", name: "x", source: null, norm_country: null })).toBeNull() // queued only: still shown
    expect(rules.firm({ id: "f3", name: "x", source: null, norm_country: null })).toBe("declined")
    expect(rules.firm({ id: "f4", name: "x", source: null, norm_country: null })).toBe("saved")
    expect(rules.firm({ id: "f9", name: "x", source: null, norm_country: null })).toBeNull() // another workspace's CRM
    expect(rules.firm({ id: "z", name: "Acme Capital", source: null, norm_country: null })).toBe("alreadyYours")
    expect(rules.firm({ id: "z", name: "Elsewhere", source: null, norm_country: null })).toBeNull() // another fund's investors
    expect(rules.person({ id: "p", email: "NOPE@x.com", source: null, restricted_at: null, norm_country: null, firm_id: null, name: "A" })).toBe("suppressed")
    expect(rules.person({ id: "p", email: "global@x.com", source: null, restricted_at: null, norm_country: null, firm_id: null, name: "A" })).toBe("suppressed")
    expect(save).toHaveBeenCalledWith(expect.anything(), "alice", expect.objectContaining({ orgId: "org-a", source: "assistant", filters: expect.objectContaining({ classes: ["family_office"] }), parentSessionId: null, options: expect.objectContaining({ includeKnown: false }) }))
  })
  it("applies the fund's own rules: allowed classes narrow the mandate, excluded countries reach the rules", async () => {
    await profile("44444444-4444-4444-4444-444444444444", "org-a", `'["family_office","fund_of_funds"]','["de","FR"]'`)
    await runLpMatch(scope, {}, deps())
    expect(run.mock.calls[0][1].filters.classes).toEqual(["family_office", "fund_of_funds"])
    expect(run.mock.calls[0][1].rules.firm({ id: "x", name: "x", source: null, norm_country: "DE" })).toBe("jurisdiction")
    expect(() => applyFundRules({ ...EMPTY_FILTERS, classes: ["sovereign_wealth"] }, ["family_office"])).toThrow(LpMatchError)
    expect(applyFundRules({ ...EMPTY_FILTERS, classes: ["family_office"] }, ["family_office", "sovereign_wealth"]).classes).toEqual(["family_office"])
    expect(applyFundRules(EMPTY_FILTERS, []).classes).toEqual([])
  })
  it("a run is the workspace's: a teammate sees it, another workspace does not, a running one is hidden", async () => {
    await profile("55555555-5555-5555-5555-555555555555", "org-a")
    await db.exec(`INSERT INTO lp_match_sessions(id,fund_profile_id,user_id,org_id,status) VALUES
      ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','55555555-5555-5555-5555-555555555555','alice','org-a','completed'),
      ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','55555555-5555-5555-5555-555555555555','alice','org-a','running')`)
    state.org = "org-a"; state.user = "bob" // a different member of the same workspace
    expect((await authorizedSession("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).id).toBe("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    await expect(authorizedSession("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")).rejects.toMatchObject({ status: 404 })
    state.org = "org-b"
    await expect(authorizedSession("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")).rejects.toMatchObject({ status: 404 })
    state.org = "org-a"; state.user = "alice"
  })
  it("the migration backfilled runs with their profile's workspace and the columns the raise path reads", async () => {
    const legacy = new PGlite()
    try {
      await legacy.exec(`CREATE TABLE fund_profiles(id uuid PRIMARY KEY, org_id text); CREATE TABLE lp_match_sessions(id uuid PRIMARY KEY, fund_profile_id uuid, created_at timestamptz DEFAULT now(), engine_version text, qualified_firms int, qualified_contacts int, total_firms_matched int, total_contacts_matched int);
        INSERT INTO fund_profiles VALUES ('11111111-1111-1111-1111-111111111111','org-a');
        INSERT INTO lp_match_sessions(id,fund_profile_id,engine_version,qualified_firms,qualified_contacts) VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','11111111-1111-1111-1111-111111111111','v2',250,1500);`)
      await legacy.exec(readFileSync("scripts/migrations/2026-10-19-lp-match-workspace.sql", "utf8"))
      expect((await legacy.query("SELECT org_id, source, total_firms_matched, total_contacts_matched FROM lp_match_sessions")).rows[0]).toEqual({ org_id: "org-a", source: "page", total_firms_matched: 250, total_contacts_matched: 1500 })
    } finally { await legacy.close() }
  })
})

describe("the engine with the workspace's rules (real SQL, small directory)", () => {
  beforeAll(async () => {
    await db.exec(`
      CREATE TABLE investment_firms(id text PRIMARY KEY, name text, type text, firm_classification text, description text, aum text, sectors jsonb, hq_location text, location text, website text, linkedin_url text, source text, norm_class text, norm_region text, norm_country text);
      CREATE TABLE investors(id text PRIMARY KEY, first_name text, last_name text, investor_type text, bio text, sectors jsonb, location text, email text, linkedin_url text, person_linkedin_url text, title text, firm_id text, source text, restricted_at timestamptz, norm_class text, norm_region text, norm_country text);
    `)
  })
  beforeEach(async () => {
    await db.exec("DELETE FROM investment_firms; DELETE FROM investors; DELETE FROM fund_profiles;")
    await db.exec(`
      INSERT INTO investment_firms(id,name,type,description,aum,sectors,hq_location,source,norm_class,norm_country) VALUES
        ('F1','Alpha Family Office','Family Office','climate family office','$900M','["climate"]','New York, United States','folk','family_office','US'),
        ('F2','Beta Family Office','Family Office','climate family office','$900M','["climate"]','New York, United States','folk','family_office','US'),
        ('F3','Gamma Family Office','Family Office','climate family office','$900M','["climate"]','Berlin, Germany','folk','family_office','DE'),
        ('F4','Delta Family Office','Family Office','climate family office','$900M','["climate"]','New York, United States','gone','family_office','US'),
        ('F5','Epsilon Family Office','Family Office','climate family office','$900M','["climate"]','New York, United States','folk','family_office','US');
      INSERT INTO investors(id,first_name,last_name,investor_type,bio,sectors,location,email,title,firm_id,source,restricted_at,norm_class,norm_country) VALUES
        ('P1','Pat','One','Family Office','climate investor','["climate"]','New York','p1@a.com','Principal','F1','folk',NULL,'family_office','US'),
        ('P2','Sam','Two','Family Office','climate investor','["climate"]','New York','p2@a.com','Principal','F5','folk',NULL,'family_office','US'),
        ('P3','Kim','Three','Family Office','climate investor','["climate"]','New York','p3@a.com','Principal','F5','folk',now(),'family_office','US'),
        ('P4','Lee','Four','Family Office','climate investor','["climate"]','New York','blocked@a.com','Principal','F5','folk',NULL,'family_office','US');
      INSERT INTO directory_sources VALUES ('gone','withdrawn','{}');
      INSERT INTO crm_entries(org_id,firm_id,stage) VALUES ('org-a','F1','contacted');
      INSERT INTO email_suppressions VALUES (NULL,'blocked@a.com');
      INSERT INTO fund_lps(fund_id,lp_name) VALUES ('fund-1','Beta Family Office');`)
    await profile("66666666-6666-6666-6666-666666666666", "org-a", `'[]','["DE"]'`)
  })
  it("counts what the rules left out by reason, never scores it, and keeps the rest", async () => {
    const row = await resolveFundProfile({ orgId: "org-a" })
    const rules = buildLpRules(await loadLpRuleData(scope, { excludedJurisdictions: ["DE"] }))
    const result = await runLpMatchingV2(toFundProfile(row), { minScore: 0, enableAi: false, rules })
    expect(result.firms.map((f) => f.firmId).sort()).toEqual(["F5"])
    expect(result.contacts.map((c) => c.investorId).sort()).toEqual(["P1", "P2"]) // P1 works at a firm already in the CRM but is not in it herself: still offered
    expect(result.exclusions).toMatchObject({ inCrm: 1, alreadyYours: 1, jurisdiction: 1, source: 1, restrictedPerson: 1, suppressed: 1 })
    expect(result.totals.rawFirms).toBe(5)
    expect(result.funnel.firms.find((s) => s.label === "Left out by your rules")?.count).toBe(4)
  })
  it("with includeKnown the contacted firm comes back, and without rules nothing is removed (the old behaviour)", async () => {
    const rules = buildLpRules(await loadLpRuleData(scope, { includeKnown: true }))
    const shown = await runLpMatchingV2(toFundProfile(await resolveFundProfile({ orgId: "org-a" })), { minScore: 0, enableAi: false, rules })
    expect(shown.firms.map((f) => f.firmId)).toContain("F1")
    const all = await runLpMatchingV2(toFundProfile(await resolveFundProfile({ orgId: "org-a" })), { minScore: 0, enableAi: false })
    expect(all.exclusions).toBeUndefined()
    expect(all.firms.length).toBeGreaterThan(shown.firms.length - 1)
  })
  it("saves the run with the workspace, where it came from and what the rules left out", async () => {
    await db.exec("DELETE FROM lp_match_sessions")
    const rules = buildLpRules(await loadLpRuleData(scope, {}))
    const result = await runLpMatchingV2(toFundProfile(await resolveFundProfile({ orgId: "org-a" })), { minScore: 0, enableAi: false, rules })
    await saveSessionV2(result, "alice", { orgId: "org-a", source: "assistant", filters: EMPTY_FILTERS })
    const [s] = (await db.query("SELECT org_id, source, status, exclusion_counts, total_firms_matched, total_contacts_matched, qualified_firms FROM lp_match_sessions")).rows as any[]
    expect(s).toMatchObject({ org_id: "org-a", source: "assistant", status: "completed" })
    expect(s.total_firms_matched).toBe(s.qualified_firms)
    expect(s.exclusion_counts.total).toBeGreaterThan(0)
  })
})
