/**
 * Run a read-only check query from scripts/checks/ against the configured
 * database and print the rows.
 *
 *   node scripts/checks/run-check.mjs scripts/checks/crm-entities-preflight.sql
 *
 * Exists because the connection string lives in .env.local rather than the
 * shell, so `psql "$NEON_DATABASE_URL" -f …` finds an empty variable and falls
 * back to a local socket. Env loading mirrors scripts/oneshot/run-migration.mjs:
 * dependency-free, and a real environment variable always wins.
 *
 * REFUSES to run anything that is not read-only. A file under checks/ that has
 * grown an INSERT is a mistake, and the useful moment to find out is before it
 * reaches a production database rather than after. Use the migration runner for
 * anything that is meant to write.
 */
import { readFile } from "node:fs/promises"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { neon } from "@neondatabase/serverless"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.join(HERE, "..", "..")

function loadEnvFiles() {
  for (const name of [".env.local", ".env"]) {
    let text
    try { text = readFileSync(path.join(REPO_ROOT, name), "utf8") } catch { continue }
    for (let line of text.split("\n")) {
      line = line.trim()
      if (!line || line.startsWith("#")) continue
      if (line.startsWith("export ")) line = line.slice(7).trim()
      const eq = line.indexOf("=")
      if (eq === -1) continue
      const key = line.slice(0, eq).trim()
      if (!key || key in process.env) continue
      let val = line.slice(eq + 1).trim()
      if (val.length >= 2 && ((val[0] === '"' && val.at(-1) === '"') || (val[0] === "'" && val.at(-1) === "'"))) {
        val = val.slice(1, -1)
      }
      process.env[key] = val
    }
  }
}

loadEnvFiles()

const file = process.argv[2]
if (!file) { console.error("usage: run-check.mjs <path/to/check.sql>"); process.exit(1) }

const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing (set it, or add it to .env.local)"); process.exit(1) }

const raw = await readFile(path.isAbsolute(file) ? file : path.join(process.cwd(), file), "utf8")

// Strip comments and string literals before looking for write keywords, so a
// keyword inside a comment or a quoted label does not trip the guard.
//
// `bare` is ONLY for the guard. The query executed is always `raw` — blanking
// literals and then running that is how this script first reported a false pass:
// kind='company' became kind='' and matched nothing.
const bare = raw
  .replace(/--[^\n]*/g, " ")
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/'(?:[^']|'')*'/g, "''")
const FORBIDDEN = /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|COPY|MERGE|VACUUM|REINDEX|REFRESH)\b/i
const hit = bare.match(FORBIDDEN)
if (hit) {
  console.error(`Refusing to run: ${path.basename(file)} contains ${hit[1].toUpperCase()}.`)
  console.error("scripts/checks/ is for read-only queries. Use scripts/oneshot/run-migration.mjs to write.")
  process.exit(1)
}

// Host only — never print the connection string.
let host = "unknown"
try { host = new URL(url).host } catch {}
console.log(`${path.basename(file)} → ${host}\n`)

const sql = neon(url)
let rows
try {
  rows = await sql.query(raw.trim().replace(/;\s*$/, ""))
} catch (e) {
  console.error(`Query failed: ${e.message}`)
  process.exit(1)
}

if (!rows.length) {
  console.log("No rows — these checks passed.")
  process.exit(0)
}

const cols = Object.keys(rows[0])
const width = Object.fromEntries(cols.map((c) => [
  c, Math.max(c.length, ...rows.map((r) => String(r[c] ?? "").length)),
]))
console.log(cols.map((c) => c.padEnd(width[c])).join("  "))
console.log(cols.map((c) => "-".repeat(width[c])).join("  "))
for (const r of rows) console.log(cols.map((c) => String(r[c] ?? "").padEnd(width[c])).join("  "))
console.log(`\n${rows.length} row(s). Every row needs a decision before the migration runs.`)
