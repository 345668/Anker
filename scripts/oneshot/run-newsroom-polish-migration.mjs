import { readFileSync } from "node:fs"
const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)
const sqlText = readFileSync("scripts/migrations/2026-06-20-newsroom-polish.sql", "utf8")
// Split on semicolons that end statements (the migration has no PL/pgSQL bodies).
const statements = sqlText
  .split(/;\s*\n/g)
  .map(s => s.replace(/--[^\n]*$/gm, "").trim())
  .filter(Boolean)
console.log(`Running ${statements.length} statements…`)
for (const s of statements) {
  const preview = s.slice(0, 80).replace(/\s+/g, " ")
  try {
    await sql.query(s)
    console.log(`  OK  ${preview}…`)
  } catch (e) {
    console.error(`  ERR ${preview}\n      ${e.message}`)
  }
}
console.log("\n=== verification ===")
const stats = await sql`SELECT COUNT(*) AS total, COUNT(slug) AS with_slug, COUNT(DISTINCT slug) AS distinct_slugs, COUNT(scheduled_for) AS scheduled, COUNT(source_pdf_url) AS with_source_pdf FROM news_articles`
console.log(stats[0])
console.log("\nsample slugs:")
const sample = await sql`SELECT id, slug, headline FROM news_articles ORDER BY published_at DESC NULLS LAST LIMIT 5`
sample.forEach(r => console.log(`  ${r.slug.padEnd(50, " ").slice(0, 50)}  ${r.headline.slice(0, 60)}`))
