/**
 * Patch — Fund Ops Phase 1: the investments spine + valuations.
 *
 *   1. investments            one row per fund × company × security event
 *                             (initial check, follow-on, studio common, …)
 *   2. valuation_snapshots    fair-value marks per investment per date
 *
 * Design notes (see FUND_OPS_DESIGN.md §3 / §3.3):
 *   - ids are TEXT uuids for consistency with funds / portfolio_companies.
 *   - investments.fund_id       → funds.id        (TEXT)
 *   - investments.company_id    → portfolio_companies.id (TEXT, nullable —
 *     a position can be recorded before the company profile exists)
 *   - valuation_snapshots keeps EVERY mark (immutable event log); the
 *     "current" fair value of a position is the latest snapshot by
 *     as_of_date then created_at.
 *
 * Idempotent. Runs from the user's Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-investments-tables.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("[1/3] Creating investments table…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS investments (
      id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fund_id             TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      company_id          TEXT REFERENCES portfolio_companies(id) ON DELETE SET NULL,
      /** Denormalised so the table renders without a JOIN even when the
       *  company profile hasn't been created yet. */
      company_name        TEXT NOT NULL,
      /** initial | follow_on | studio_common | secondary | bridge | other */
      investment_kind     TEXT NOT NULL DEFAULT 'initial' CHECK (investment_kind IN (
        'initial', 'follow_on', 'studio_common', 'secondary', 'bridge', 'other'
      )),
      /** safe | convertible_note | preferred | common | warrant | other */
      security_type       TEXT NOT NULL DEFAULT 'preferred' CHECK (security_type IN (
        'safe', 'convertible_note', 'preferred', 'common', 'warrant', 'other'
      )),
      round_name          TEXT,
      invested_at         DATE,
      /** Cost basis in fund currency. 0 allowed (studio common at formation). */
      cost_basis          NUMERIC(18,2) NOT NULL DEFAULT 0,
      share_count         NUMERIC(18,4),
      fully_diluted_pct   NUMERIC(9,6),
      round_valuation     NUMERIC(18,2),
      /** active | exited | written_off */
      status              TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
        'active', 'exited', 'written_off'
      )),
      exited_at           DATE,
      /** Realized proceeds on exit / partial exits to date. */
      realized_proceeds   NUMERIC(18,2) NOT NULL DEFAULT 0,
      notes               TEXT,
      metadata            JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS investments_fund_idx ON investments(fund_id, status)`
  await sql`CREATE INDEX IF NOT EXISTS investments_company_idx ON investments(company_id)`
  console.log("       OK  investments + 2 indexes")
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

console.log("[2/3] Creating valuation_snapshots table…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS valuation_snapshots (
      id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      investment_id       TEXT NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
      fund_id             TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      as_of_date          DATE NOT NULL,
      fair_value          NUMERIC(18,2) NOT NULL,
      /** cost | last_round | mark | write_down | write_off | exit */
      method              TEXT NOT NULL DEFAULT 'cost' CHECK (method IN (
        'cost', 'last_round', 'mark', 'write_down', 'write_off', 'exit'
      )),
      /** Where the number came from: round event, 409a, manual, audit. */
      source              TEXT,
      note                TEXT,
      created_by          TEXT,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS valuation_snapshots_inv_idx ON valuation_snapshots(investment_id, as_of_date DESC, created_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS valuation_snapshots_fund_idx ON valuation_snapshots(fund_id, as_of_date DESC)`
  console.log("       OK  valuation_snapshots + 2 indexes")
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

console.log("[3/3] Sanity check…")
try {
  const [inv] = await sql`SELECT COUNT(*)::int AS n FROM investments`
  const [val] = await sql`SELECT COUNT(*)::int AS n FROM valuation_snapshots`
  console.log(`       OK  investments=${inv.n} rows, valuation_snapshots=${val.n} rows`)
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

console.log("Done.")
