/**
 * Generic .sql migration runner for the Anker repo.
 *
 * v0 emits migrations as raw .sql files under scripts/migrations/. This
 * runner reads one, splits it on semicolons, and runs each statement
 * against Neon. All the v0 migrations are IF NOT EXISTS style so re-runs
 * are safe.
 *
 * Usage:
 *   NEON_DATABASE_URL='…' node scripts/oneshot/run-migration.mjs \
 *     scripts/migrations/2026-07-04-linkedin-network.sql
 *
 * Or the convenience wrappers next to this file (run-migration-*.mjs)
 * which hard-code a specific migration path.
 */
import { readFile } from "node:fs/promises"
import { neon } from "@neondatabase/serverless"

const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }

const file = process.argv[2]
if (!file) { console.error("Usage: node run-migration.mjs <path/to/file.sql>"); process.exit(1) }

const sql = neon(url)
const raw = await readFile(file, "utf8")

// Strip -- comments (line-level; block comments are rare here) then split
// on statement-terminating semicolons at end of line. Preserve DO $$ ... $$
// blocks if present by tracking dollar-quotes.
const clean = raw
  .split("\n")
  .filter((l) => !/^\s*--/.test(l))
  .join("\n")

const stmts = splitSql(clean).map((s) => s.trim()).filter(Boolean)

console.log(`Applying ${stmts.length} statement(s) from ${file}…`)
let n = 0
for (const stmt of stmts) {
  n++
  const first = stmt.split(/\s+/, 3).slice(0, 3).join(" ").toUpperCase()
  try {
    await sql.query(stmt)
    console.log(`  [${String(n).padStart(2)}/${stmts.length}] OK   ${first}…`)
  } catch (e) {
    console.error(`  [${String(n).padStart(2)}/${stmts.length}] ERR  ${first}…`)
    console.error(`         ${e.message}`)
    process.exit(1)
  }
}
console.log("\nDone.")

/** Split on semicolons, respecting $$…$$ dollar-quotes and '…' string literals. */
function splitSql(src) {
  const out = []
  let buf = ""
  let inSingle = false
  let dollarTag = null   // e.g. "$$" or "$body$"; null if outside a dollar-quote
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (dollarTag) {
      buf += c
      if (c === "$" && src.slice(i).startsWith(dollarTag)) {
        buf += dollarTag.slice(1)
        i += dollarTag.length - 1
        dollarTag = null
      }
      continue
    }
    if (inSingle) {
      buf += c
      if (c === "'" && src[i - 1] !== "\\") inSingle = false
      continue
    }
    if (c === "'") { inSingle = true; buf += c; continue }
    // Line comments — skip to end of line so apostrophes in them (e.g.
    // "the user's copy") don't corrupt the quote tracker.
    if (c === "-" && src[i + 1] === "-") {
      while (i < src.length && src[i] !== "\n") i++
      buf += "\n"
      continue
    }
    if (c === "$") {
      // Look for opening dollar-quote tag: $$ or $tag$
      const m = src.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/)
      if (m) { dollarTag = m[0]; buf += m[0]; i += m[0].length - 1; continue }
    }
    if (c === ";") { out.push(buf); buf = ""; continue }
    buf += c
  }
  if (buf.trim()) out.push(buf)
  return out
}
