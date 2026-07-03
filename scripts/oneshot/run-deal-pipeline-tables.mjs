/**
 * Patch — Fund Ops Phase 2: GP deal pipeline (FUND_OPS_DESIGN.md §3.1).
 *
 *   1. deal_opportunities   sourced → … → closed state machine, with the
 *                           AI memo + its frozen context on the row.
 *   2. deal_evaluations     weighted scorecard, one row per deal (upserted).
 *   3. ic_votes             one row per member per deal — the audit trail.
 *   4. term_grids           versioned proposed terms; latest version wins.
 *
 * Idempotent. Runs from the user's Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-deal-pipeline-tables.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("[1/5] Creating deal_opportunities…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS deal_opportunities (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      fund_id         TEXT NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      company_name    TEXT NOT NULL,
      website         TEXT,
      one_liner       TEXT,
      sector          TEXT,
      geography       TEXT,
      round_name      TEXT,
      raise_amount    NUMERIC(18,2),
      pre_money       NUMERIC(18,2),
      proposed_check  NUMERIC(18,2),
      source          TEXT,
      owner_email     TEXT,
      stage           TEXT NOT NULL DEFAULT 'sourced' CHECK (stage IN (
        'sourced', 'screened', 'deep_dive', 'ic_scheduled', 'ic_approved',
        'term_sheet', 'committed', 'closed', 'passed'
      )),
      passed_reason   TEXT,
      /** Stage-transition audit trail: [{stage, at, by}] appended on move. */
      stage_history   JSONB NOT NULL DEFAULT '[]'::jsonb,
      /** AI deal memo + the exact context it was generated against. */
      memo_md         TEXT,
      memo_context    JSONB,
      memo_generated_at TIMESTAMPTZ,
      memo_model      TEXT,
      /** Set by the close action — links to the investments spine. */
      investment_id   TEXT,
      closed_at       TIMESTAMPTZ,
      notes           TEXT,
      metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS deal_opps_fund_stage_idx ON deal_opportunities(fund_id, stage)`
  console.log("       OK  deal_opportunities + index")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[2/5] Creating deal_evaluations…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS deal_evaluations (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      deal_id         TEXT NOT NULL UNIQUE REFERENCES deal_opportunities(id) ON DELETE CASCADE,
      /** {criterion_key: {score: 1-5, note}} — criteria defined in code
       *  (lib/portfolio/deal-pipeline.ts DEAL_CRITERIA) so the taxonomy
       *  can evolve without migrations, same as the assessment module. */
      scores          JSONB NOT NULL DEFAULT '{}'::jsonb,
      weighted_score  NUMERIC(6,3),
      summary         TEXT,
      evaluated_by    TEXT,
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  console.log("       OK  deal_evaluations")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[3/5] Creating ic_votes…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS ic_votes (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      deal_id         TEXT NOT NULL REFERENCES deal_opportunities(id) ON DELETE CASCADE,
      member          TEXT NOT NULL,
      vote            TEXT NOT NULL CHECK (vote IN ('approve', 'approve_with_conditions', 'decline', 'abstain')),
      conditions      TEXT,
      note            TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (deal_id, member)
    )
  `
  console.log("       OK  ic_votes")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[4/5] Creating term_grids…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS term_grids (
      id              TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      deal_id         TEXT NOT NULL REFERENCES deal_opportunities(id) ON DELETE CASCADE,
      version         INTEGER NOT NULL,
      security_type   TEXT,
      pre_money       NUMERIC(18,2),
      round_size      NUMERIC(18,2),
      check_amount    NUMERIC(18,2),
      pro_rata        BOOLEAN,
      board_seat      TEXT,
      liquidation_pref TEXT,
      other_terms     TEXT,
      created_by      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (deal_id, version)
    )
  `
  console.log("       OK  term_grids")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[5/5] Sanity check…")
try {
  const [d] = await sql`SELECT COUNT(*)::int AS n FROM deal_opportunities`
  console.log(`       OK  deal_opportunities=${d.n} rows`)
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("Done.")
