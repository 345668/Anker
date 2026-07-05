/**
 * Patch — create the fund_assessment_history table.
 *
 * One row per snapshot of a fund's assessment. Phase 2 uses these rows to
 * compute the "+N delta since last visit" badge and the per-domain delta
 * chips visible in the screenshot.
 *
 * We snapshot on every PATCH that crosses a debounce window (15 min by
 * default) — frequent enough to capture meaningful editor sessions, sparse
 * enough that the table stays small. The PATCH handler reads the latest
 * row and only inserts a new one if (now - last_snapshot) >= debounce OR
 * the score changed by >= 5 points.
 *
 * Schema:
 *   id              uuid primary key
 *   fund_id         uuid not null (no FK — keeps drift-safe per repo convention)
 *   strength        int not null         — Strength score 0-1000 at snapshot time
 *   domain_scores   jsonb default '{}'   — { domain_key: completion_fraction }
 *   subcat_scores   jsonb default '{}'   — { domain:sub: completion_fraction }
 *   filled_critical    int default 0
 *   filled_supporting  int default 0
 *   filled_supplemental int default 0
 *   total_critical     int default 0
 *   total_supporting   int default 0
 *   total_supplemental int default 0
 *   captured_by     text
 *   captured_at     timestamptz default now()
 *
 * Idempotent. Run from your Mac:
 *
 *   NEON_DATABASE_URL='...' node scripts/oneshot/run-fund-assessment-history-table.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("Creating fund_assessment_history table…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS fund_assessment_history (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fund_id               UUID NOT NULL,
      strength              INT NOT NULL DEFAULT 0,
      domain_scores         JSONB NOT NULL DEFAULT '{}'::jsonb,
      subcat_scores         JSONB NOT NULL DEFAULT '{}'::jsonb,
      filled_critical       INT NOT NULL DEFAULT 0,
      filled_supporting     INT NOT NULL DEFAULT 0,
      filled_supplemental   INT NOT NULL DEFAULT 0,
      total_critical        INT NOT NULL DEFAULT 0,
      total_supporting      INT NOT NULL DEFAULT 0,
      total_supplemental    INT NOT NULL DEFAULT 0,
      captured_by           TEXT,
      captured_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log("  OK  fund_assessment_history")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

console.log("\nAdding indexes…")
try {
  // (fund_id, captured_at DESC) — fast "give me the latest N snapshots for fund X"
  await sql`
    CREATE INDEX IF NOT EXISTS fund_assessment_history_fund_idx
      ON fund_assessment_history (fund_id, captured_at DESC)
  `
  console.log("  OK  fund_assessment_history_fund_idx")
} catch (e) {
  console.error(`  ERR ${e.message}`)
}

const cnt = await sql`SELECT COUNT(*) AS n FROM fund_assessment_history`
console.log(`\nfund_assessment_history: ${cnt[0].n} row(s).`)
console.log("\nDone. Each PATCH against /api/portfolio/funds/[id]/assessment will now")
console.log("snapshot to history (debounced 15 min OR score-delta ≥ 5 points).")
