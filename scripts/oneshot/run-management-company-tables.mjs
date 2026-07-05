/**
 * Patch — Fund Ops Phase 6: management company + studio operations
 * (FUND_OPS_DESIGN.md §3.4 / §3.5).
 *
 *   1. mc_budget_lines   annual budget, by category, per lead fund's
 *                        management company.
 *   2. mc_actuals        spend entries against those categories.
 *   3. studio_projects   idea → validation → build → spun_out pipeline;
 *                        spinout writes the Phase-1 investments spine
 *                        (fund check + studio common) and a portfolio
 *                        company, same close semantics as the deal
 *                        pipeline.
 *
 * Fee INCOME needs no table — it's read from fee_accruals (Phase 4):
 * paid accruals are received income, accrued ones are receivable.
 *
 * Idempotent. Runs from the user's Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-management-company-tables.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("[1/4] Creating mc_budget_lines…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS mc_budget_lines (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fund_id       TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      year          INTEGER NOT NULL,
      category      TEXT NOT NULL,
      planned_amount NUMERIC(18,2) NOT NULL DEFAULT 0,
      notes         TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (fund_id, year, category)
    )
  `
  console.log("       OK  mc_budget_lines")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[2/4] Creating mc_actuals…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS mc_actuals (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fund_id       TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      occurred_on   DATE NOT NULL,
      category      TEXT NOT NULL,
      amount        NUMERIC(18,2) NOT NULL,
      memo          TEXT,
      created_by    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS mc_actuals_fund_idx ON mc_actuals(fund_id, occurred_on)`
  console.log("       OK  mc_actuals + index")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[3/4] Creating studio_projects…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS studio_projects (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fund_id         TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      name            TEXT NOT NULL,
      one_liner       TEXT,
      sector          TEXT,
      lead_eir        TEXT,
      stage           TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN (
        'idea', 'validation', 'build', 'spun_out', 'archived'
      )),
      budget_amount   NUMERIC(18,2),
      spent_amount    NUMERIC(18,2) NOT NULL DEFAULT 0,
      started_at      DATE,
      stage_history   JSONB NOT NULL DEFAULT '[]'::jsonb,
      /** Set by spinout — links into the fund of record. */
      company_id      TEXT,
      investment_id   TEXT,
      spun_out_at     TIMESTAMPTZ,
      notes           TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS studio_projects_fund_idx ON studio_projects(fund_id, stage)`
  console.log("       OK  studio_projects + index")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[4/4] Sanity check…")
try {
  const [b] = await sql`SELECT COUNT(*)::int AS n FROM mc_budget_lines`
  const [p] = await sql`SELECT COUNT(*)::int AS n FROM studio_projects`
  console.log(`       OK  mc_budget_lines=${b.n}, studio_projects=${p.n}`)
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("Done.")
