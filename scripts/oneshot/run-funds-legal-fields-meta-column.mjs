/**
 * Patch — add funds.legal_fields_meta jsonb column.
 *
 * Phase-3 storage for AI generation provenance, keyed by field slug:
 *   {
 *     "investment_philosophy": {
 *       "confidence": 0.82,
 *       "generated_at": "2026-06-22T17:30:00Z",
 *       "model": "qwen2.5-32b-instruct",
 *       "prompt_version": "v1",
 *       "generated_by": "philippe@..."
 *     },
 *     …
 *   }
 *
 * Mirrors funds.assessment_meta — keeps the legal + assessment AI flows
 * consistent. Idempotent.
 *
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-funds-legal-fields-meta-column.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("Adding funds.legal_fields_meta jsonb column…")
try {
  await sql`ALTER TABLE funds ADD COLUMN IF NOT EXISTS legal_fields_meta JSONB DEFAULT '{}'::jsonb`
  console.log("  OK  funds.legal_fields_meta JSONB")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

const cnt = await sql`
  SELECT COUNT(*) AS n,
         COUNT(*) FILTER (WHERE legal_fields_meta IS NOT NULL AND legal_fields_meta != '{}'::jsonb) AS with_meta
    FROM funds
`
console.log(`\nfunds: ${cnt[0].n} row(s), ${cnt[0].with_meta} with AI-generation metadata.`)
console.log("\nDone. Generate buttons on the 8 narrative fields will now persist confidence + provenance.")
