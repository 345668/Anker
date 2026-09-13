import { expect, it } from "vitest"
import { readFileSync } from "node:fs"
import { PGlite } from "@electric-sql/pglite"

const migration = readFileSync("scripts/migrations/2026-09-11-portfolio-fund-authorization.sql", "utf8")

it.each([
  ["unmapped fund", "INSERT INTO portfolio_companies (fund_id, name, slug) VALUES ('unknown', 'Orphan', 'orphan')", "Unmapped portfolio"],
  ["unlinked extraction", "INSERT INTO portfolio_kpi_extractions (raw_text) VALUES ('No company or fund')", "Unmapped portfolio"],
  ["cross-fund company link", "INSERT INTO portfolio_kpi_extractions (fund_id, company_id, raw_text) VALUES ('beta', 'legacy', 'Wrong fund')", "Cross-fund KPI"],
  ["ambiguous alias", "INSERT INTO funds VALUES ('alpha', 'other')", "Ambiguous fund"],
  ["duplicate legacy/canonical slug", "INSERT INTO portfolio_companies (fund_id, name, slug) VALUES ('fund-a', 'Duplicate', 'legacy')", "duplicate key"],
])("rolls back the entire migration for %s", async (_name, seed, error) => {
  const db = new PGlite()
  try {
    await db.exec("CREATE TABLE funds (id text PRIMARY KEY, slug text UNIQUE); INSERT INTO funds VALUES ('fund-a', 'alpha'), ('fund-b', 'beta')")
    for (const file of ["2026-06-20-portfolio-tracker.sql", "2026-06-20-lp-quarterly-reports.sql", "2026-07-17-kpi-extractions.sql"]) {
      await db.exec(readFileSync(`scripts/migrations/${file}`, "utf8"))
    }
    await db.exec("INSERT INTO portfolio_companies (id, fund_id, name, slug) VALUES ('legacy', 'alpha', 'Legacy', 'legacy')")
    await db.exec(seed)
    // One DO statement remains atomic even through the HTTP migration runner,
    // which sends each top-level SQL statement on a separate connection.
    await expect(db.exec(migration)).rejects.toThrow(error)
    expect((await db.query("SELECT fund_id FROM portfolio_companies WHERE id = 'legacy'")).rows).toEqual([{ fund_id: "alpha" }])
  } finally { await db.close() }
}, 15000)
