/**
 * Patch — Fund Ops Phase 4: fee schedules + accruals + waterfall runs
 * (FUND_OPS_DESIGN.md §3.3 / §5 "Fees + waterfall").
 *
 *   1. fee_schedules    per-fund management-fee terms (%, base, step-down)
 *   2. fee_accruals     one row per quarter, generated from the schedule
 *   3. waterfall_runs   deterministic carry calcs — frozen inputs + per-LP
 *                       outputs; a run can pre-fill a distribution draft
 *
 * Idempotent. Runs from the user's Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-fees-waterfall-tables.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("[1/4] Creating fee_schedules…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS fee_schedules (
      id                TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fund_id           TEXT NOT NULL UNIQUE REFERENCES funds(id) ON DELETE CASCADE,
      /** Annual fee as a fraction (0.02 = 2%). */
      annual_fee_pct    NUMERIC(7,5) NOT NULL DEFAULT 0.02,
      /** committed | called | invested — the base the fee is charged on. */
      fee_base          TEXT NOT NULL DEFAULT 'committed' CHECK (fee_base IN (
        'committed', 'called', 'invested'
      )),
      /** Fee starts accruing from this date (usually first close). */
      start_date        DATE NOT NULL,
      /** Total years the fee runs (typical 10). */
      term_years        INTEGER NOT NULL DEFAULT 10,
      /** After this many years the pct steps down (0 = no step-down). */
      stepdown_after_years INTEGER NOT NULL DEFAULT 0,
      stepdown_fee_pct  NUMERIC(7,5),
      notes             TEXT,
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log("       OK  fee_schedules")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[2/4] Creating fee_accruals…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS fee_accruals (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fund_id       TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      /** Quarter end this accrual covers (YYYY-MM-DD, e.g. 2026-03-31). */
      period_end    DATE NOT NULL,
      base_kind     TEXT NOT NULL,
      base_amount   NUMERIC(18,2) NOT NULL,
      fee_pct       NUMERIC(7,5) NOT NULL,
      fee_amount    NUMERIC(18,2) NOT NULL,
      status        TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN (
        'accrued', 'paid', 'waived'
      )),
      paid_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (fund_id, period_end)
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS fee_accruals_fund_idx ON fee_accruals(fund_id, period_end)`
  console.log("       OK  fee_accruals + index")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[3/4] Creating waterfall_runs…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS waterfall_runs (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fund_id         TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      run_number      INTEGER NOT NULL,
      /** Frozen inputs: gross amount, hurdle, carry, catch-up, per-LP
       *  called capital + prior distributions at run time. */
      inputs          JSONB NOT NULL,
      /** Frozen outputs: tier totals + per-LP breakdown. */
      outputs         JSONB NOT NULL,
      /** Set when the run pre-filled a distribution draft. */
      distribution_id TEXT,
      created_by      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (fund_id, run_number)
    )
  `
  console.log("       OK  waterfall_runs")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[4/4] Sanity check…")
try {
  const [f] = await sql`SELECT COUNT(*)::int AS n FROM fee_schedules`
  const [w] = await sql`SELECT COUNT(*)::int AS n FROM waterfall_runs`
  console.log(`       OK  fee_schedules=${f.n}, waterfall_runs=${w.n}`)
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("Done.")
