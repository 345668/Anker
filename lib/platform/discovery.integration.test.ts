import { afterAll, beforeAll, expect, it, vi } from "vitest"
import { PGlite } from "@electric-sql/pglite"
const state = vi.hoisted(() => ({ query: null as any }))
vi.mock("@/lib/db", () => ({ sql: { unsafe: (query: string, values: unknown[]) => state.query(query, values) } }))
import { checkSizeRange, searchDiscovery } from "./discovery"
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  state.query = async (query: string, values: unknown[]) => (await db.query(query, values)).rows
  await db.exec(`
    CREATE TABLE investment_firms (id text PRIMARY KEY, name text, stages jsonb, sectors jsonb, type text, hq_location text, check_size_min text, check_size_max text);
    CREATE TABLE investors (id text PRIMARY KEY, first_name text, last_name text, firm_id text, stages jsonb, sectors jsonb, investor_type text, location text, is_active boolean DEFAULT true, email text, emails jsonb, check_size_min text, check_size_max text);
    INSERT INTO investment_firms VALUES ('f', 'Specialist Capital', '["Seed"]', '["Climate"]', 'VC', 'Germany', '10000', '75000');
    INSERT INTO investors (id, first_name, last_name, stages, sectors, investor_type, location)
      SELECT 'ordinary-' || n, 'Ordinary', lpad(n::text, 3, '0'), '["Pre-Seed"]', '["Fintech"]', 'Angel', 'Germany' FROM generate_series(1, 120) n;
    INSERT INTO investors (id, first_name, last_name, firm_id, stages, sectors, investor_type, location, email, emails, check_size_min, check_size_max)
      VALUES ('rare', 'Rare', 'Zed', 'f', '["Seed"]', '"Climate; Deep Tech"', 'Family Office', 'Japan', ' ', '["valid@example.test"]', '25000', '100000'),
      ('large', 'Large', 'Zed', NULL, '["Growth"]', '["Space"]', 'VC', 'USA', NULL, NULL, '100000000', '300000000'),
      ('unknown', 'Unknown', 'Zed', NULL, 'null', 'null', NULL, NULL, NULL, NULL, 'undisclosed', NULL);
    INSERT INTO investors (id, first_name, last_name, is_active, sectors, location) VALUES ('inactive', 'Inactive', 'Zed', false, '["Hidden sector"]', 'Hidden country');
  `)
}, 15000)
afterAll(async () => { await db.close() })

it("returns full-source facets even when the matching record is beyond the first page", async () => {
  const first = await searchDiscovery("investors", new URLSearchParams("limit=1"))
  expect(first.investors).toHaveLength(1)
  expect(first.pagination.total).toBe(123)
  expect(first.facets.countries).toContain("Japan")
  expect(first.facets.sectors).toContain("Deep Tech")
  expect(first.facets.sectors).not.toContain("Hidden sector")
  expect(first.facets.types).toContain("Family Office")
  const filtered = await searchDiscovery("investors", new URLSearchParams("country=Japan&sector=Deep+Tech&stage=Seed&limit=1"))
  expect(filtered.investors.map((r: any) => r.id)).toEqual(["rare"])
  expect(filtered.pagination).toMatchObject({ total: 1, hasMore: false, totalPages: 1 })
})
it("matches categorical stages exactly and keeps filtered totals on empty pages", async () => {
  const result = await searchDiscovery("investors", new URLSearchParams("stage=Seed&page=2&limit=1"))
  expect(result.investors).toEqual([])
  expect(result.pagination.total).toBe(1)
})
it("accepts the actual check-size menu ranges and excludes unknown numeric ranges", async () => {
  for (const range of ["$10K-$50K", "$50K-$100K", "$100K-$250K"]) {
    const result = await searchDiscovery("investors", new URLSearchParams({ check: range }))
    expect(result.investors.map((r: any) => r.id)).toEqual(["rare"])
  }
  expect((await searchDiscovery("investors", new URLSearchParams({ check: "$100M+" }))).investors.map((r: any) => r.id)).toEqual(["large"])
  expect(checkSizeRange("$100K")).toEqual({ min: 100000, max: 100000 })
  expect(() => checkSizeRange("$100K-$10K")).toThrow()
})
it("searches joined firm names and resolves email-array fallbacks", async () => {
  const result = await searchDiscovery("investors", new URLSearchParams("search=Specialist&hasEmail=true"))
  expect(result.investors.map((r: any) => [r.id, r.firm_name])).toEqual([["rare", "Specialist Capital"]])
})
it("uses the same facets and range filtering for firms", async () => {
  const result = await searchDiscovery("firms", new URLSearchParams({ check: "$50K-$100K", stage: "seed" }))
  expect(result.pagination.total).toBe(1)
  expect(result.facets).toEqual({ countries: ["Germany"], sectors: ["Climate"], stages: ["Seed"], types: ["VC"] })
})
it("treats wildcard characters and SQL-looking input as literal values", async () => {
  for (const search of ["%", "_", "' OR true --"]) {
    expect((await searchDiscovery("investors", new URLSearchParams({ search }))).pagination.total).toBe(0)
  }
})
