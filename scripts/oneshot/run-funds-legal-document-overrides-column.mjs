/**
 * Patch — add funds.legal_document_overrides jsonb column.
 *
 * Stores per-document operator edits to the rendered template body:
 *   {
 *     "<doc_key>": {
 *       "body": "<edited Markdown>",
 *       "updated_at": "ISO-8601",
 *       "updated_by": "<email>"
 *     },
 *     ...
 *   }
 *
 * Read flow checks this column FIRST; if a doc_key has an override,
 * the renderer uses it instead of substituting the template. The Word/
 * PDF/Markdown exporters all key off the same body, so whatever the
 * operator sees in the browser is what comes out in the chosen format.
 *
 * Run:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-funds-legal-document-overrides-column.mjs
 */

const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

console.log("Adding funds.legal_document_overrides jsonb column…")
try {
  await sql`ALTER TABLE funds ADD COLUMN IF NOT EXISTS legal_document_overrides JSONB DEFAULT '{}'::jsonb`
  console.log("  OK  funds.legal_document_overrides JSONB DEFAULT '{}'::jsonb")
} catch (e) {
  console.error(`  ERR ${e.message}`)
  process.exit(1)
}

const cnt = await sql`
  SELECT COUNT(*) AS n,
         COUNT(*) FILTER (WHERE legal_document_overrides IS NOT NULL
                            AND legal_document_overrides != '{}'::jsonb) AS with_overrides
    FROM funds
`
console.log(`\nfunds: ${cnt[0].n} row(s), ${cnt[0].with_overrides} with document overrides.`)
console.log("\nDone. In-browser edits to legal documents will now persist per-fund and flow into the Word / PDF / Markdown downloads.")
