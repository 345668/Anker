import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
vi.mock("server-only", () => ({}))
// Discover's semantic path needs a provider; these tests exercise the lenses.
vi.mock("@/lib/ai/semantic-search", () => ({ similarFirms: async () => [], similarInvestors: async () => [] }))

const state = vi.hoisted(() => ({ query: null as any, audit: [] as any[] }))
vi.mock("@/lib/db", () => ({
  sql: Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => state.query(strings.reduce((q, s, i) => q + (i ? `$${i}` : "") + s, ""), values),
    { unsafe: (query: string, values: unknown[] = []) => state.query(query, values) },
  ),
}))
vi.mock("@/lib/audit/record-change", () => ({ recordChange: async (input: any) => { state.audit.push(input) } }))

import { getCompanyListing, setCompanyListing, getFundListing, setFundListing, ListingError } from "./listings"
import { parseDiscoveryParams, searchDiscovery } from "./discovery"

let db: PGlite
const founder = { orgId: "org-founder", userId: "u-founder" }
const other = { orgId: "org-other", userId: "u-other" }
const gp = { orgId: "org-fund", userId: "u-gp" }
const ctx = { actor: { userId: "u-founder" }, ip: null, userAgent: null } as any

beforeAll(async () => {
  db = new PGlite()
  state.query = async (q: string, v: unknown[]) => (await db.query(q, v)).rows
  await db.exec(`
    CREATE TABLE organizations (id text PRIMARY KEY, kind text, owner_user_id text, fund_id text);
    CREATE TABLE funds (id text PRIMARY KEY, name text, description text, vintage_year int, target_size numeric, currency text,
      status text, vehicle_kind text, manager_org text, listed_for_lps boolean DEFAULT false, listed_for_lps_at timestamptz,
      listed_for_lps_by text, updated_at timestamptz);
    CREATE TABLE startups (id text PRIMARY KEY, org_id text, founder_id text, name text, tagline text, description text, stage text,
      industries jsonb, location text, website text, linkedin_url text, founder_linkedin text, target_amount int, funding_target text,
      is_public boolean DEFAULT false, listed_at timestamptz, listed_by text, listing_source text, created_at timestamptz, updated_at timestamptz);
    CREATE TABLE startup_profiles (id text PRIMARY KEY, org_id text, version int, fields jsonb, provenance jsonb, created_by text, created_at timestamptz DEFAULT now());
    -- The lens queries read these two; empty is the honest state for a fresh workspace.
    CREATE TABLE discovery_facets (lens text, kind text, facet text, value text, label text, n int);
    CREATE TABLE founder_match_runs (id text PRIMARY KEY, org_id text, created_at timestamptz DEFAULT now(), expires_at timestamptz DEFAULT now() + interval '180 days');
    INSERT INTO organizations VALUES ('org-founder','company','u-founder',NULL), ('org-other','company','u-other',NULL), ('org-fund','fund','u-gp','fund-1');
    INSERT INTO funds (id, name, status) VALUES ('fund-1','Anker Fund I','fundraising');
    INSERT INTO startup_profiles (id, org_id, version, fields, provenance) VALUES
      ('spv-1','org-founder',1,'{"name":"Northwind Sports","oneLiner":"Training platform for athletic programs","stage":"pre-seed","sectors":["sports technology","healthtech"],"location":"United States","askAmount":1000000,"pitchDeckSummary":"secret deck summary","thesisKeywords":["closed-loop data"],"arr":180000}'::jsonb,'{}'::jsonb);
  `)
}, 30000)
afterAll(async () => db.close())
beforeEach(() => { state.audit.length = 0 })

describe("company listing", () => {
  it("refuses to list a workspace with no saved profile, and says why", async () => {
    await expect(setCompanyListing(other, true, ctx)).rejects.toBeInstanceOf(ListingError)
    expect((await getCompanyListing(other)).blocked).toMatch(/Save your company profile/)
  })

  it("lists only the projected fields — never the deck summary, keywords or revenue", async () => {
    const after = await setCompanyListing(founder, true, ctx)
    expect(after).toMatchObject({ listed: true, name: "Northwind Sports", stage: "pre-seed", raising: 1000000 })
    const res = await db.query<any>("SELECT * FROM startups WHERE org_id = 'org-founder'")
    const stored = JSON.stringify(res.rows[0])
    expect(stored).not.toContain("secret deck summary")
    expect(stored).not.toContain("closed-loop data")
    expect(stored).not.toContain("180000")
    expect(res.rows[0].tagline).toBe("Training platform for athletic programs")
  })

  it("appears in the fund manager's lens, and disappears the moment it is unlisted", async () => {
    await setCompanyListing(founder, true, ctx)
    const lens = () => searchDiscovery({ orgId: "org-fund", persona: "vc", userId: "u-gp" },
      parseDiscoveryParams(new URLSearchParams("lens=vc_startups&kind=startups"), "vc"))
    expect((await lens()).rows.map((r) => r.name)).toEqual(["Northwind Sports"])
    await setCompanyListing(founder, false, ctx)
    expect((await lens()).rows).toEqual([])
  })

  it("records both changes in the audit trail, in the company's scope", async () => {
    await setCompanyListing(founder, true, ctx)
    await setCompanyListing(founder, false, ctx)
    expect(state.audit.map((a) => a.action)).toEqual(["company_listing.listed", "company_listing.unlisted"])
    expect(state.audit[0]).toMatchObject({ scope: { type: "company", id: "org-founder" }, after: { is_public: true } })
  })

  it("keeps the row when unlisted, so re-listing needs nothing re-entered", async () => {
    await setCompanyListing(founder, false, ctx)
    const res = await db.query<any>("SELECT count(*)::int n FROM startups WHERE org_id = 'org-founder'")
    expect(res.rows[0].n).toBe(1)
  })
})

describe("fund listing", () => {
  it("lists a fund for LPs and shows it in the LP lens", async () => {
    const after = await setFundListing(gp, true, ctx)
    expect(after).toMatchObject({ listed: true, name: "Anker Fund I" })
    const lens = await searchDiscovery({ orgId: null, persona: "lp", userId: "lp-1" },
      parseDiscoveryParams(new URLSearchParams("lens=lp_funds&kind=funds"), "lp"))
    expect(lens.rows.map((r) => r.name)).toEqual(["Anker Fund I"])
    await setFundListing(gp, false, ctx)
    const after2 = await searchDiscovery({ orgId: null, persona: "lp", userId: "lp-1" },
      parseDiscoveryParams(new URLSearchParams("lens=lp_funds&kind=funds"), "lp"))
    expect(after2.rows).toEqual([])
  })

  it("refuses a workspace that manages no fund", async () => {
    await expect(setFundListing(founder, true, ctx)).rejects.toThrow(/does not manage a fund/)
  })

  it("audits in the fund's scope", async () => {
    await setFundListing(gp, true, ctx)
    expect(state.audit[0]).toMatchObject({ scope: { type: "fund", id: "fund-1" }, action: "fund_listing.listed" })
  })
})
