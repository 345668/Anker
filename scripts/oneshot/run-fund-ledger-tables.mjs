/**
 * Patch — Fund Ops Phase 3: the fund general ledger (FUND_OPS_DESIGN.md §3.3).
 *
 *   1. journal_entries   one row per accounting event, double-entry
 *   2. journal_lines     DR/CR lines referencing the code-defined chart
 *
 * The chart of accounts is code-defined (lib/portfolio/fund-ledger.ts
 * VENTURE_CHART) — same pattern as the deal-scorecard and assessment
 * taxonomies: it evolves without migrations, and journal lines store the
 * account code + a denormalised account name for permanence.
 *
 * Auto-booked entries carry (source_kind, source_id) so the projection
 * can be rebuilt idempotently from the record; manual entries survive
 * rebuilds.
 *
 * Idempotent. Runs from the user's Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-fund-ledger-tables.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("[1/3] Creating journal_entries…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fund_id       TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      entry_date    DATE NOT NULL,
      memo          TEXT NOT NULL,
      /** manual | call_paid | investment_close | valuation | realized |
       *  distribution_paid — auto kinds are wiped + re-derived on rebuild. */
      source_kind   TEXT NOT NULL DEFAULT 'manual' CHECK (source_kind IN (
        'manual', 'call_paid', 'investment_close', 'valuation',
        'realized', 'distribution_paid', 'fee_accrual'
      )),
      /** Id of the record row this entry was derived from (line item id,
       *  investment id, snapshot id…). Null for manual entries. */
      source_id     TEXT,
      created_by    TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS journal_entries_fund_idx ON journal_entries(fund_id, entry_date)`
  await sql`CREATE INDEX IF NOT EXISTS journal_entries_source_idx ON journal_entries(fund_id, source_kind)`
  console.log("       OK  journal_entries + 2 indexes")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[2/3] Creating journal_lines…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS journal_lines (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      entry_id      TEXT NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      account_code  TEXT NOT NULL,
      account_name  TEXT NOT NULL,
      debit         NUMERIC(18,2) NOT NULL DEFAULT 0,
      credit        NUMERIC(18,2) NOT NULL DEFAULT 0,
      CHECK (debit >= 0 AND credit >= 0),
      CHECK (NOT (debit > 0 AND credit > 0))
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS journal_lines_entry_idx ON journal_lines(entry_id)`
  await sql`CREATE INDEX IF NOT EXISTS journal_lines_account_idx ON journal_lines(account_code)`
  console.log("       OK  journal_lines + 2 indexes")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[3/3] Sanity check…")
try {
  const [j] = await sql`SELECT COUNT(*)::int AS n FROM journal_entries`
  console.log(`       OK  journal_entries=${j.n} rows`)
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("Done.")
