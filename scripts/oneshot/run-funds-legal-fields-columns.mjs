/**
 * Patch — add funds.legal_fields + funds.legal_field_approvals jsonb cols.
 *
 * Phase-2 storage for the 94-field legal taxonomy.
 *
 *   funds.legal_fields           jsonb default '{}'
 *     { field_key: value, … }
 *
 *   funds.legal_field_approvals  jsonb default '{}'
 *     { field_key: { approved_at, approved_by }, … }
 *
 * Same shape as the assessment columns — keeps reasoning + tooling
 * consistent across components.
 *
 * Idempotent. Run from your Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-funds-legal-fields-columns.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("Adding funds.legal_fields…")
try {
  await sql`ALTER TABLE funds ADD COLUMN IF NOT EXISTS legal_fields JSONB DEFAULT '{}'::jsonb`
  console.log("  OK  funds.legal_fields JSONB")
} catch (e) { console.error(`  ERR ${e.message}`); process.exit(1) }

console.log("Adding funds.legal_field_approvals…")
try {
  await sql`ALTER TABLE funds ADD COLUMN IF NOT EXISTS legal_field_approvals JSONB DEFAULT '{}'::jsonb`
  console.log("  OK  funds.legal_field_approvals JSONB")
} catch (e) { console.error(`  ERR ${e.message}`); process.exit(1) }

console.log("\nAdding GIN indexes…")
try {
  await sql`CREATE INDEX IF NOT EXISTS funds_legal_fields_gin_idx ON funds USING GIN (legal_fields)`
  console.log("  OK  funds_legal_fields_gin_idx")
  await sql`CREATE INDEX IF NOT EXISTS funds_legal_field_approvals_gin_idx ON funds USING GIN (legal_field_approvals)`
  console.log("  OK  funds_legal_field_approvals_gin_idx")
} catch (e) { console.error(`  ERR ${e.message}`) }

const cnt = await sql`
  SELECT COUNT(*) AS n,
         COUNT(*) FILTER (WHERE legal_fields IS NOT NULL AND legal_fields != '{}'::jsonb) AS with_fields,
         COUNT(*) FILTER (WHERE legal_field_approvals IS NOT NULL AND legal_field_approvals != '{}'::jsonb) AS with_approvals
    FROM funds
`
console.log(`\nfunds: ${cnt[0].n} row(s), ${cnt[0].with_fields} with values, ${cnt[0].with_approvals} with approvals.`)
console.log("\nDone. /dashboard/portfolio/fund/legal/fields will now persist values + approvals.")
