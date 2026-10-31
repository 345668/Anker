/** The CSV importer after a merge (docs/architecture/55 E4): a row for a folded-in record lands on the survivor, and no second record is made. */
import { PGlite } from "@electric-sql/pglite"
import { readFileSync } from "node:fs"
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest"
vi.mock("server-only", () => ({}))
const state = vi.hoisted(() => ({ q: null as any }))
vi.mock("@/lib/db", () => { const f: any = (s: TemplateStringsArray, ...v: unknown[]) => state.q(s.reduce((q, t, i) => q + (i ? `$${i}` : "") + t, ""), v); f.unsafe = (t: string, v: unknown[] = []) => state.q(t, v); return { sql: f } })
process.env.DIRECTORY_HASH_KEY = "imp-key"
import { importCsv } from "./csv-importer"
import { ensureCanary } from "@/lib/directory/maintenance"

let db: PGlite
const rows = async (q: string, p: unknown[] = []) => (await db.query(q, p)).rows as any[]
beforeAll(async () => {
  db = new PGlite(); state.q = async (q: string, v: unknown[] = []) => (await db.query(q, v)).rows
  await db.exec(`CREATE TABLE investment_firms (id varchar PRIMARY KEY, name text, type text, firm_classification text, hq_location text, location text, website text, sectors jsonb, description text, typical_check_size text, founded_year int, source text, created_at timestamp, updated_at timestamp, parent_firm_id text);
    CREATE TABLE investors (id varchar PRIMARY KEY, first_name varchar NOT NULL, last_name varchar, title varchar, email varchar, linkedin_url varchar, person_linkedin_url varchar, bio text, investor_type varchar, firm_id varchar REFERENCES investment_firms(id), location varchar, status varchar, source varchar, is_active boolean, created_at timestamp, updated_at timestamp, metadata jsonb DEFAULT '{}');
    CREATE TABLE platform_flags (key text PRIMARY KEY, enabled boolean DEFAULT false, rollout_pct int DEFAULT 100, description text);`)
  for (const f of ["2026-10-16-directory-sources", "2026-10-16b-directory-tombstones", "2026-11-01-directory-merges"]) await db.exec(readFileSync(`scripts/migrations/${f}.sql`, "utf8"))
  await ensureCanary("imp-key")
}, 30000)
afterAll(async () => db.close())
beforeEach(async () => { await db.exec("DELETE FROM directory_alias_keys; DELETE FROM directory_aliases; DELETE FROM directory_merges; DELETE FROM investors; DELETE FROM investment_firms") })

const firmCsv = "Name,Website,Founders\nKindred Capital,https://kindred.example,Ann Lee\n"
const run = (csv: string, kind: "firm" | "investor" = "firm") => importCsv({ kind, source: "csv:t", bytes: new TextEncoder().encode(csv), dryRun: false, defaultFirmType: "venture capital" })

describe("the importer after a merge", () => {
  it("a firm that was folded into another lands on the survivor: no second firm, and its founders attach to the survivor", async () => {
    expect(await run(firmCsv)).toMatchObject({ firmsInserted: 1, investorsInserted: 1 })
    const [loser] = await rows("SELECT id FROM investment_firms"), [founder] = await rows("SELECT id FROM investors")
    // A person merged it into another firm: the loser row is gone, the survivor holds its people, and the alias records old id -> new id.
    await db.exec(`INSERT INTO investment_firms (id, name) VALUES ('survivor', 'Kindred Capital VC')`); await db.query("UPDATE investors SET firm_id = 'survivor' WHERE id = $1", [founder.id]); await db.query("DELETE FROM investment_firms WHERE id = $1", [loser.id])
    const m = (await rows(`INSERT INTO directory_merges (kind, survivor_id, loser_id, by_staff, loser_row, undo_until) VALUES ('firm', 'survivor', $1, 'a@x', '{}', now() + interval '90 days') RETURNING id`, [loser.id]))[0].id
    await db.query("INSERT INTO directory_aliases (kind, old_id, new_id, merge_id) VALUES ('firm', $1, 'survivor', $2)", [loser.id, m])
    const again = await run(firmCsv)
    expect(again).toMatchObject({ firmsInserted: 0, firmsAlreadyPresent: 1, investorsInserted: 0 })
    expect((await rows("SELECT id FROM investment_firms ORDER BY id")).map((r) => r.id)).toEqual(["survivor"]); expect((await rows("SELECT id, firm_id FROM investors")).map((r) => r.firm_id)).toEqual(["survivor"])
  })
  it("without any alias nothing changes: the same row is recognised by its own id as before", async () => {
    await run(firmCsv); expect(await run(firmCsv)).toMatchObject({ firmsInserted: 0, firmsAlreadyPresent: 1 }); expect((await rows("SELECT count(*)::int n FROM investment_firms"))[0].n).toBe(1)
  })
  it("a person folded into another is not created again", async () => {
    const csv = "Full Name,Email,Title\nAnna Berg,anna@fund.com,Partner\n"
    expect(await run(csv, "investor")).toMatchObject({ investorsInserted: 1 }); const [p] = await rows("SELECT id FROM investors")
    await db.exec(`INSERT INTO investors (id, first_name, source, is_active) VALUES ('survivor-person', 'Anna', 'csv:t', true)`); await db.query("DELETE FROM investors WHERE id = $1", [p.id])
    const m = (await rows(`INSERT INTO directory_merges (kind, survivor_id, loser_id, by_staff, loser_row, undo_until) VALUES ('person', 'survivor-person', $1, 'a@x', '{}', now() + interval '90 days') RETURNING id`, [p.id]))[0].id
    await db.query("INSERT INTO directory_aliases (kind, old_id, new_id, merge_id) VALUES ('person', $1, 'survivor-person', $2)", [p.id, m])
    expect(await run(csv, "investor")).toMatchObject({ investorsInserted: 0, investorsAlreadyPresent: 1 }); expect((await rows("SELECT id FROM investors")).map((r) => r.id)).toEqual(["survivor-person"])
  })
})
