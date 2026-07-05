import { readFileSync } from "node:fs"
const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)
const sqlText = readFileSync("scripts/migrations/2026-06-20-portfolio-tracker.sql", "utf8")
const statements = sqlText
  .split(/;\s*\n/g)
  .map(s => s.replace(/--[^\n]*$/gm, "").trim())
  .filter(Boolean)
console.log(`Running ${statements.length} statements…`)
for (const s of statements) {
  const preview = s.slice(0, 80).replace(/\s+/g, " ")
  try { await sql.query(s); console.log(`  OK  ${preview}…`) }
  catch (e) { console.error(`  ERR ${preview}\n      ${e.message}`) }
}
console.log("\n=== verification ===")
const cnt = await sql`SELECT
  (SELECT COUNT(*) FROM portfolio_companies)    AS companies,
  (SELECT COUNT(*) FROM portfolio_kpis_monthly) AS kpi_rows`
console.log(cnt[0])
