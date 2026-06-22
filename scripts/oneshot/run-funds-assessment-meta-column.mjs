/**
 * Patch — add funds.assessment_meta jsonb column.
 *
 * Phase 3 storage for AI-generation metadata. Keyed by field slug:
 *   {
 *     "investment_philosophy": {
 *       "confidence": 0.82,
 *       "generated_at": "2026-06-22T17:30:00Z",
 *       "model": "qwen2.5-32b-instruct",
 *       "prompt_version": "v1",
 *       "generated_by": "philippe@..."
 *     },
 *     ...
 *   }
 *
 * Kept separate from funds.assessment so the value column stays a flat
 * key→value map (no schema gymnastics in the form code).
 *
 * Idempotent. Run from your Mac:
 *   NEON_DATABASE_URL='...' node scripts/oneshot/run-funds-assessment-meta-column.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("Adding funds.assessment_meta jsonb column…")
try {
  await sql`ALTER TABLE funds ADD COLUMN IF NOT EXISTS assessment_meta JSONB DEFAULT '{}'::jsonb`
  console.log("  OK  funds.assessment_meta JSONB")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

const cnt = await sql`
  SELECT COUNT(*) AS n,
         COUNT(*) FILTER (WHERE assessment_meta IS NOT NULL AND assessment_meta != '{}'::jsonb) AS with_meta
    FROM funds
`
console.log(`\nfunds: ${cnt[0].n} row(s) total, ${cnt[0].with_meta} with AI-generation metadata.`)
console.log("\nDone. The Generate button in the assessment editor will now persist confidence + provenance.")
