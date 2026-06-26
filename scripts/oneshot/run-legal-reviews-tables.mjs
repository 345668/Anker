/**
 * Patch — phase-5 submit-for-legal-review schema.
 *
 *   1. funds.legal_credits_balance        integer DEFAULT 0
 *   2. legal_reviews                      one row per submission, with
 *      a value/approval snapshot pinned at submit time so we have an
 *      audit trail even if the editor edits keep flowing
 *   3. legal_credit_transactions          ledger of purchases + spends
 *
 * Idempotent. Runs from the user's Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-legal-reviews-tables.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("[1/3] Adding funds.legal_credits_balance…")
try {
  await sql`ALTER TABLE funds ADD COLUMN IF NOT EXISTS legal_credits_balance INTEGER DEFAULT 0`
  console.log("       OK  funds.legal_credits_balance INTEGER DEFAULT 0")
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

console.log("[2/3] Creating legal_reviews table…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS legal_reviews (
      id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fund_id             UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      status              TEXT NOT NULL CHECK (status IN (
        'submitted', 'in_review', 'needs_changes', 'approved', 'cancelled'
      )),
      submitted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_by        TEXT,
      completed_at        TIMESTAMPTZ,
      reviewer_email      TEXT,
      reviewer_notes      TEXT,
      snapshot_values     JSONB NOT NULL DEFAULT '{}'::jsonb,
      snapshot_approvals  JSONB NOT NULL DEFAULT '{}'::jsonb,
      credits_used        INTEGER NOT NULL DEFAULT 1,
      total_fields        INTEGER NOT NULL DEFAULT 0,
      approved_fields     INTEGER NOT NULL DEFAULT 0,
      filled_fields       INTEGER NOT NULL DEFAULT 0,
      empty_fields        INTEGER NOT NULL DEFAULT 0,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS legal_reviews_fund_idx ON legal_reviews(fund_id, submitted_at DESC)`
  await sql`CREATE INDEX IF NOT EXISTS legal_reviews_status_idx ON legal_reviews(status) WHERE status IN ('submitted', 'in_review', 'needs_changes')`
  console.log("       OK  legal_reviews + 2 indexes")
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

console.log("[3/3] Creating legal_credit_transactions ledger…")
try {
  await sql`
    CREATE TABLE IF NOT EXISTS legal_credit_transactions (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      fund_id         UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
      delta           INTEGER NOT NULL,
      reason          TEXT NOT NULL CHECK (reason IN (
        'purchase', 'spend_submit', 'refund', 'grant', 'adjustment'
      )),
      review_id       UUID REFERENCES legal_reviews(id) ON DELETE SET NULL,
      balance_after   INTEGER NOT NULL,
      memo            TEXT,
      created_by      TEXT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS legal_credit_tx_fund_idx ON legal_credit_transactions(fund_id, created_at DESC)`
  console.log("       OK  legal_credit_transactions + 1 index")
} catch (e) {
  console.error(`       ERR ${e.message}`)
  process.exit(1)
}

const counts = await sql`
  SELECT
    (SELECT COUNT(*) FROM funds)                                       AS funds_total,
    (SELECT COUNT(*) FROM funds WHERE legal_credits_balance > 0)       AS funds_with_credits,
    (SELECT COUNT(*) FROM legal_reviews)                                AS reviews_total,
    (SELECT COUNT(*) FROM legal_credit_transactions)                    AS tx_total
`
console.log("")
console.log("Summary:")
console.log(`  funds                          ${counts[0].funds_total} total, ${counts[0].funds_with_credits} with credits`)
console.log(`  legal_reviews                  ${counts[0].reviews_total} row(s)`)
console.log(`  legal_credit_transactions      ${counts[0].tx_total} row(s)`)
console.log("")
console.log("Done. Submit-for-Legal-Review button on the canvas + editor + documents view is now live.")
