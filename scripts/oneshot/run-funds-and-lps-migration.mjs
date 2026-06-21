import { readFileSync } from "node:fs"
const { neon } = await import("@neondatabase/serverless")
const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)
const sqlText = readFileSync("scripts/migrations/2026-06-21-funds-and-lps.sql", "utf8")

// Split on statement terminators that end a line. The INSERT … VALUES … ON
// CONFLICT statement is single-line-ish but contains a trailing newline so
// the same naive split that worked for the other migrations works here too.
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
const cnt = await sql`
  SELECT
    (SELECT COUNT(*) FROM funds)    AS funds,
    (SELECT COUNT(*) FROM fund_lps) AS fund_lps
`
console.log(cnt[0])
const seed = await sql`SELECT id, slug, name, status FROM funds WHERE slug = 'svs-fund-ii'`
console.log("\nseed row:", seed[0] ?? "(missing — ON CONFLICT branch hit)")
