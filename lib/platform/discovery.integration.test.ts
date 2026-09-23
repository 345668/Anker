import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"

const state = vi.hoisted(() => ({ query: null as any }))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values),
    { unsafe: (query: string, values: unknown[] = []) => state.query(query, values) },
  ),
}))
// The semantic path needs embeddings and a provider; the text path is what this exercises.
vi.mock("@/lib/ai/semantic-search", () => ({ similarFirms: vi.fn(async () => []), similarInvestors: vi.fn(async () => []) }))

import { checkSizeRange, parseDiscoveryParams, searchDiscovery, DiscoveryError, type DiscoveryScope } from "./discovery"

let db: PGlite
const founder: DiscoveryScope = { orgId: "org-1", persona: "founder", userId: "u1" }
const vc: DiscoveryScope = { orgId: "org-2", persona: "vc", userId: "u2" }
const lp: DiscoveryScope = { orgId: null, persona: "lp", userId: "u3" }

const params = (s: string) => new URLSearchParams(s)
const run = (scope: DiscoveryScope, query: string) => searchDiscovery(scope, parseDiscoveryParams(params(query), scope.persona))

beforeAll(async () => {
  db = new PGlite()
  state.query = async (query: string, values: unknown[]) => (await db.query(query, values)).rows
  await db.exec(`
    CREATE TABLE investment_firms (id text PRIMARY KEY, name text, description text, industry text, type text, firm_classification text,
      hq_location text, location text, website text, linkedin_url text, emails jsonb, aum text, portfolio_count int, updated_at timestamptz,
      norm_country text, norm_region text, norm_sectors text[], norm_stages text[], norm_class text, check_min numeric, check_max numeric,
      phone text, metadata jsonb, folk_custom_fields jsonb, embedding text);
    CREATE TABLE investors (id text PRIMARY KEY, first_name text, last_name text, title text, firm_id text, investor_type text, bio text,
      location text, email text, linkedin_url text, person_linkedin_url text, website text, is_active boolean DEFAULT true, updated_at timestamptz,
      norm_country text, norm_region text, norm_sectors text[], norm_stages text[], norm_class text, check_min numeric, check_max numeric,
      phone text, address text, user_id text, metadata jsonb, folk_custom_fields jsonb, enrichment_status text, embedding text);
    CREATE TABLE startups (id text PRIMARY KEY, name text, tagline text, description text, stage text, industries jsonb, location text,
      website text, linkedin_url text, founder_linkedin text, target_amount int, funding_target text, is_public boolean, updated_at timestamptz);
    CREATE TABLE funds (id text PRIMARY KEY, name text, description text, vintage_year int, target_size numeric, currency text, status text,
      vehicle_kind text, manager_org text, listed_for_lps boolean DEFAULT false, updated_at timestamptz);
    CREATE TABLE crm_entries (id serial PRIMARY KEY, org_id text, firm_id text, investor_id text, stage text);
    CREATE TABLE email_verifications (email text PRIMARY KEY, status text, expires_at timestamptz);
    CREATE TABLE founder_match_runs (id text PRIMARY KEY, org_id text, created_at timestamptz DEFAULT now(), expires_at timestamptz DEFAULT now() + interval '180 days');
    CREATE TABLE founder_match_results (run_id text, kind text, rank int, entity_id text, firm_id text, score real);
    CREATE TABLE discovery_facets (lens text, kind text, facet text, value text, label text, n int);

    INSERT INTO investment_firms (id, name, description, type, firm_classification, hq_location, website, linkedin_url, emails, portfolio_count,
      norm_country, norm_region, norm_sectors, norm_stages, norm_class, check_min, check_max, phone, metadata, embedding, updated_at)
    VALUES ('f-sports', 'Sports Capital', 'Backs athlete performance software', 'VC', 'Venture Capital', 'New York, United States',
        'https://sports.example', 'https://linkedin.com/company/sports', '["deals@sports.example"]', 40,
        'US', 'north_america', ARRAY['sports','saas'], ARRAY['pre-seed','seed'], 'vc', 250000, 1000000, '+1 555', '{"secret":1}', '[0.1]', now()),
      ('f-climate', 'Climate Partners', 'Backs climate', 'VC', 'Venture Capital', 'Amsterdam, Netherlands', NULL, NULL, '[]', 10,
        'NL', 'europe', ARRAY['cleantech'], ARRAY['seed'], 'vc', 1000000, 5000000, NULL, NULL, NULL, now() - interval '400 days'),
      ('f-office', 'Family Wealth', 'Allocator', 'Family Office', 'Family Office', 'Zurich, Switzerland', NULL, NULL, '[]', 0,
        'CH', 'europe', ARRAY[]::text[], ARRAY[]::text[], 'family_office', 5000000, 50000000, NULL, NULL, NULL, now());

    INSERT INTO investors (id, first_name, last_name, title, firm_id, investor_type, bio, location, email, linkedin_url, is_active,
      norm_country, norm_region, norm_sectors, norm_stages, norm_class, check_min, check_max, phone, address, user_id, updated_at)
    VALUES ('p-partner', 'Pat', 'Partner', 'Managing Partner', 'f-sports', 'VC', 'Sports tech investor', 'New York, United States',
        'pat@sports.example', 'https://linkedin.com/in/pat', true, 'US', 'north_america', ARRAY['sports'], ARRAY['pre-seed'], 'vc', 50000, 250000,
        '+1 555 000', '1 Main St', 'user-9', now()),
      ('p-angel', 'Ann', 'Angel', NULL, NULL, 'Angel', 'Angel', 'Berlin, Germany', NULL, NULL, true,
        'DE', 'europe', ARRAY['saas'], ARRAY['pre-seed'], 'angel', 10000, 50000, NULL, NULL, NULL, now()),
      ('p-allocator', 'Lee', 'Ledger', 'CIO', 'f-office', 'Family Office', 'Allocates to funds', 'Zurich, Switzerland',
        'lee@family.example', NULL, true, 'CH', 'europe', ARRAY[]::text[], ARRAY[]::text[], 'family_office', 1000000, 10000000, NULL, NULL, NULL, now()),
      ('p-inactive', 'Old', 'Record', NULL, NULL, 'VC', NULL, 'Nowhere', NULL, NULL, false, 'US', 'north_america', ARRAY['sports'], ARRAY['pre-seed'], 'vc', NULL, NULL, NULL, NULL, NULL, now());

    INSERT INTO startups VALUES ('s-public', 'Northwind Sports', 'Training platform', 'desc', 'pre-seed', '["sports"]', 'United States', 'https://northwind.example', NULL, NULL, 1000000, '$1M', true, now()),
      ('s-private', 'Stealth', 'Hidden', 'desc', 'seed', '[]', 'United States', NULL, NULL, NULL, 0, NULL, false, now());
    INSERT INTO funds VALUES ('fund-listed', 'Anker Fund I', 'Pre-seed sports', 2026, 25000000, 'USD', 'raising', 'fund', 'org-2', true, now()),
      ('fund-hidden', 'Private Fund', 'Not listed', 2025, 10000000, 'USD', 'closed', 'fund', 'org-2', false, now());

    INSERT INTO email_verifications VALUES ('pat@sports.example', 'valid', now() + interval '30 days');
    INSERT INTO crm_entries (org_id, firm_id, investor_id, stage) VALUES ('org-1', 'f-climate', NULL, 'contacted'), ('org-1', 'f-sports', 'p-partner', 'queued');
    INSERT INTO founder_match_runs (id, org_id) VALUES ('run-1', 'org-1');
    INSERT INTO founder_match_results VALUES ('run-1', 'group', 1, 'f-sports', 'f-sports', 96.5), ('run-1', 'independent', 1, 'p-angel', NULL, 61.2);
    INSERT INTO discovery_facets VALUES ('founder', 'firms', 'country', 'US', 'United States', 1), ('founder', 'firms', 'sector', 'sports', 'Sports tech', 1);
  `)
}, 30000)
afterAll(async () => { await db.close() })

describe("lenses and projection", () => {
  it("sends only the columns a persona may see — never phone, address, ids or embeddings", async () => {
    const people = await run(founder, "kind=investors")
    const keys = Object.keys(people.rows[0])
    for (const forbidden of ["phone", "address", "user_id", "metadata", "folk_custom_fields", "enrichment_status", "embedding", "is_active"]) {
      expect(keys).not.toContain(forbidden)
    }
    expect(keys).toEqual(expect.arrayContaining(["id", "name", "title", "firm_name", "email", "email_status", "linkedin"]))
    const firms = await run(founder, "kind=firms")
    expect(Object.keys(firms.rows[0])).not.toContain("phone")
  })

  it("shows a fund manager allocators, not the founders' investor list", async () => {
    const lps = await run(vc, "lens=vc_lps&kind=firms")
    expect(lps.rows.map((r) => r.id)).toEqual(["f-office"])
    const co = await run(vc, "lens=vc_coinvestors&kind=firms")
    expect(co.rows.map((r) => r.id).sort()).toEqual(["f-climate", "f-sports"])
  })

  it("shows an LP fund managers and listed funds only", async () => {
    const managers = await run(lp, "lens=lp_managers&kind=firms")
    expect(managers.rows.map((r) => r.id).sort()).toEqual(["f-climate", "f-sports"])
    const funds = await run(lp, "lens=lp_funds&kind=funds")
    expect(funds.rows.map((r) => r.id)).toEqual(["fund-listed"])
  })

  it("shows a fund manager only startups whose founders opted in", async () => {
    const startups = await run(vc, "lens=vc_startups&kind=startups")
    expect(startups.rows.map((r) => r.id)).toEqual(["s-public"])
  })

  it("refuses another persona's lens by falling back to its own", async () => {
    expect((await run(lp, "lens=vc_lps&kind=firms")).rows.map((r) => r.id).sort()).toEqual(["f-climate", "f-sports"])
  })
})

describe("filters", () => {
  it("filters people by check size — the filter that always returned nothing", async () => {
    // Ranges overlap inclusively: the angel's $10K–$50K touches $50K–$250K.
    expect((await run(founder, "kind=investors&check=$50K-$250K")).rows.map((r) => r.id).sort()).toEqual(["p-angel", "p-partner"])
    const r = await run(founder, "kind=investors&check=$100K-$250K")
    expect(r.rows.map((r) => r.id)).toEqual(["p-partner"])
    expect(checkSizeRange("$100K")).toEqual({ min: 100000, max: 100000 })
    expect(() => checkSizeRange("$100K-$10K")).toThrow(DiscoveryError)
  })

  it("filters on normalised country, sector, stage and class", async () => {
    expect((await run(founder, "kind=firms&country=NL")).rows.map((r) => r.id)).toEqual(["f-climate"])
    expect((await run(founder, "kind=firms&sector=sports")).rows.map((r) => r.id)).toEqual(["f-sports"])
    expect((await run(founder, "kind=investors&stage=pre-seed")).total).toBe(2)
    expect((await run(founder, "kind=investors&class=angel")).rows.map((r) => r.id)).toEqual(["p-angel"])
    expect((await run(founder, "kind=firms&region=europe")).total).toBe(2)
  })

  it("filters by contactability and hides records already in the CRM", async () => {
    expect((await run(founder, "kind=investors&hasEmail=true")).rows.map((r) => r.id).sort()).toEqual(["p-allocator", "p-partner"])
    expect((await run(founder, "kind=investors&hasLinkedIn=true")).rows.map((r) => r.id)).toEqual(["p-partner"])
    expect((await run(founder, "kind=firms&hideSaved=true")).rows.map((r) => r.id).sort()).toEqual(["f-office", "f-sports"])
  })

  it("leaves inactive people out", async () => {
    expect((await run(founder, "kind=investors")).rows.map((r) => r.id)).not.toContain("p-inactive")
  })

  it("treats wildcards and SQL-looking input as literal text", async () => {
    for (const search of ["%", "_", "' OR true --"]) {
      expect((await run(founder, `kind=investors&search=${encodeURIComponent(search)}`)).total).toBe(0)
    }
    expect((await run(founder, "kind=investors&search=Sports+tech")).searchMode).toBe("text") // semantic mocked empty → falls back
  })

  it("rejects impossible pagination", () => {
    expect(() => parseDiscoveryParams(params("limit=5000"), "founder")).toThrow(DiscoveryError)
  })
})

describe("workspace context", () => {
  it("carries the CRM stage and the fit score from the workspace's latest run", async () => {
    const firms = await run(founder, "kind=firms&sort=fit")
    expect(firms.rows[0]).toMatchObject({ id: "f-sports", fit_score: 96.5, crm_stage: null })
    const climate = firms.rows.find((r) => r.id === "f-climate")
    expect(climate).toMatchObject({ crm_stage: "contacted" })
    const people = await run(founder, "kind=investors&sort=fit")
    expect(people.rows[0]).toMatchObject({ id: "p-partner", fit_score: 96.5 }) // through their firm's group
    expect(people.rows.find((r) => r.id === "p-angel")).toMatchObject({ fit_score: 61.2 })
  })

  it("shows another workspace no CRM or fit information", async () => {
    const firms = await run(vc, "lens=vc_coinvestors&kind=firms")
    expect(firms.rows.every((r) => r.crm_stage === null)).toBe(true)
    expect(firms.rows.every((r) => r.fit_score === null)).toBe(true)
  })

  it("carries the email verification status", async () => {
    const people = await run(founder, "kind=investors&hasEmail=true")
    expect(people.rows.find((r) => r.id === "p-partner")).toMatchObject({ email_status: "valid" })
    expect(people.rows.find((r) => r.id === "p-allocator")).toMatchObject({ email_status: null })
  })

  it("reads facets from the materialised table", async () => {
    const r = await run(founder, "kind=firms")
    expect(r.facets.country).toEqual([{ value: "US", label: "United States", n: 1 }])
    expect(r.facets.sector).toEqual([{ value: "sports", label: "Sports tech", n: 1 }])
  })
})
