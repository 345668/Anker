/**
 * Patch — founder pitch intake: submission columns on deal_opportunities.
 *
 *   deck_url        pitch-deck file (Vercel Blob or /public fallback)
 *   contact_name    founder contact from the public form
 *   contact_email   founder contact from the public form
 *   submitted_via   'internal' (default) | 'public_form'
 *
 * Idempotent. Runs from the user's Mac:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-deal-submission-columns.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("[1/2] Adding submission columns to deal_opportunities…")
try {
  await sql`ALTER TABLE deal_opportunities ADD COLUMN IF NOT EXISTS deck_url TEXT`
  await sql`ALTER TABLE deal_opportunities ADD COLUMN IF NOT EXISTS contact_name TEXT`
  await sql`ALTER TABLE deal_opportunities ADD COLUMN IF NOT EXISTS contact_email TEXT`
  await sql`ALTER TABLE deal_opportunities ADD COLUMN IF NOT EXISTS submitted_via TEXT NOT NULL DEFAULT 'internal'`
  console.log("       OK  deck_url, contact_name, contact_email, submitted_via")
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("[2/2] Sanity check…")
try {
  const [r] = await sql`
    SELECT COUNT(*)::int AS n FROM information_schema.columns
     WHERE table_name = 'deal_opportunities'
       AND column_name IN ('deck_url', 'contact_name', 'contact_email', 'submitted_via')`
  console.log(`       OK  ${r.n}/4 columns present`)
} catch (e) { console.error(`       ERR ${e.message}`); process.exit(1) }

console.log("Done.")
