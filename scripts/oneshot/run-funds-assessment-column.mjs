/**
 * Patch — add funds.assessment jsonb column.
 *
 * Stores the 158-field fund assessment as a single jsonb blob keyed by
 * field slug (see lib/portfolio/fund-assessment-taxonomy.ts). One column
 * keeps schema-flexible — we add new fields in TS without writing a
 * migration each time.
 *
 * Idempotent. Run from your Mac (sandbox is blocked from Neon):
 *
 *   NEON_DATABASE_URL='...' node scripts/oneshot/run-funds-assessment-column.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("Adding funds.assessment jsonb column…")
try {
  await sql`ALTER TABLE funds ADD COLUMN IF NOT EXISTS assessment JSONB DEFAULT '{}'::jsonb`
  console.log("  OK  funds.assessment JSONB")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

// Cheap GIN index so phase-2 analytics queries (e.g. "show all funds where
// fund_domicile = 'Delaware'") stay fast as the corpus grows.
console.log("\nAdding GIN index on funds.assessment…")
try {
  await sql`CREATE INDEX IF NOT EXISTS funds_assessment_gin_idx ON funds USING GIN (assessment)`
  console.log("  OK  funds_assessment_gin_idx")
} catch (e) {
  console.error(`  ERR ${e.message}`)
}

const cnt = await sql`
  SELECT COUNT(*) AS n,
         COUNT(*) FILTER (WHERE assessment IS NOT NULL AND assessment != '{}'::jsonb) AS filled
    FROM funds
`
console.log(`\nfunds: ${cnt[0].n} row(s) total, ${cnt[0].filled} with assessment data.`)
console.log("\nDone. The /dashboard/portfolio/fund/assessment page will now load.")
