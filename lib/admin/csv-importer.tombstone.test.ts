/** The CSV importer does not bring back an erased person, and fails closed under a different hash key. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => state.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); f.unsafe = (t: string, v: unknown[] = []) => state.q(t, v); return { sql: f } })
process.env.DIRECTORY_HASH_KEY = "imp-key"
import { importCsv } from "./csv-importer"
import { hashEmail } from "@/lib/directory/identity"
import { ensureCanary } from "@/lib/directory/maintenance"

let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  state.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE investors (id varchar PRIMARY KEY, first_name varchar NOT NULL, last_name varchar, title varchar, email varchar, linkedin_url varchar, person_linkedin_url varchar, bio text, investor_type varchar, firm_id varchar, location varchar, status varchar, source varchar, is_active boolean, created_at timestamp, updated_at timestamp, metadata jsonb DEFAULT '{}');
    CREATE TABLE investment_firms (id serial PRIMARY KEY, name text, source text); CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);`)
  await db.exec(readFileSync("scripts/migrations/2026-10-16-directory-sources.sql", "utf8"))
  await db.exec(readFileSync("scripts/migrations/2026-10-16b-directory-tombstones.sql", "utf8"))
}, 30000)
afterAll(async () => db.close())
const csv = "Full Name,Email,Title\nAnna Berg,anna@fund.com,Partner\nGone Person,gone@fund.com,Partner\n"
const run = () => importCsv({ kind: "investor", source: "csv:t", bytes: new TextEncoder().encode(csv), dryRun: false, defaultFirmType: "venture capital" })

describe("csv importer and tombstones", () => {
  it("leaves out a tombstoned person and imports the rest, counting them", async () => {
    await ensureCanary("imp-key")
    await db.query("INSERT INTO directory_tombstones (email_hash, reason) VALUES ($1, 'erasure')", [hashEmail("gone@fund.com", "imp-key")])
    const r = await run()
    expect(r).toMatchObject({ investorsInserted: 1, investorsTombstoned: 1 })
    expect(((await db.query("SELECT email FROM investors")).rows as any[]).map((x) => x.email)).toEqual(["anna@fund.com"])
  })
  it("a different hash key makes the row error out instead of importing unchecked", async () => {
    await db.exec("DELETE FROM investors")
    process.env.DIRECTORY_HASH_KEY = "laptop-key"
    try { const r = await run(); expect(r.investorsInserted).toBe(0); expect(r.errors.length).toBeGreaterThan(0) } finally { process.env.DIRECTORY_HASH_KEY = "imp-key" }
    expect((await db.query("SELECT count(*)::int n FROM investors")).rows[0]).toMatchObject({ n: 0 })
  })
})
