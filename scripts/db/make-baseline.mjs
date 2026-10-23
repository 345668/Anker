#!/usr/bin/env node
// Writes db/baseline/<date>.sql (schema only, no rows) and db/baseline/<date>.schema.json (tables, columns, indexes, as introspected) from PRODUCTION, read-only.
// docs/architecture/59 section 4 (R2) and 75. Needs the pg_dump client (libpq) and NEON_DATABASE_URL in the environment.
//   NEON_DATABASE_URL=... node scripts/db/make-baseline.mjs [YYYY-MM-DD]
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!url || /localhost|127\.0\.0\.1/.test(url)) { console.error("Set NEON_DATABASE_URL to the database to read."); process.exit(2) }
const date = process.argv[2] || new Date().toISOString().slice(0, 10)
const pgDump = process.env.PG_DUMP || ["/opt/homebrew/opt/libpq/bin/pg_dump", "/usr/local/opt/libpq/bin/pg_dump"].find(existsSync) || "pg_dump"

const raw = execFileSync(pgDump, ["--schema-only", "--no-owner", "--no-privileges", "--no-publications", "--no-subscriptions", url], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 })

// Drop what the hosting platform owns and the application never uses: the Neon session-JWT extension, the PostgREST schema, and a leftover platform migrations schema.
const blocks = raw.split(/\n--\n(?=-- Name: )/)
const keep = [blocks[0]]
const dropped = []
for (const b of blocks.slice(1)) {
  const h = /^-- Name: ([^;]*); Type: ([^;]*); Schema: ([^;]*);/.exec(b)
  const [name, type, schema] = h ? [h[1], h[2], h[3].trim()] : ["", "", ""]
  const platform = ["_system", "pgrst"].includes(schema) || (["SCHEMA"].includes(type) && ["_system", "pgrst"].includes(name)) || /pg_session_jwt/.test(name) || /^EXTENSION pg_session_jwt/.test(name)
  if (platform) dropped.push(`${type} ${name}`); else keep.push(b)
}
// pg_dump 18 adds psql meta-commands (\\restrict <random token>) that are not SQL and make the file differ on every run.
let sql = keep.join("\n--\n").replace(/^\\(un)?restrict .*$/gm, "")
// Objects that referenced the dropped schemas (a trigger or grant) would fail to load; the dump has none (checked below).
if (/pgrst\.|_system\.|pg_session_jwt/.test(sql)) { console.error("The baseline still references platform objects:", [...new Set(sql.match(/(pgrst\.\w+|_system\.\w+|pg_session_jwt)/g))]); process.exit(1) }

const sqlc = neon(url)
const ledger = (await sqlc`SELECT filename FROM schema_migrations ORDER BY filename`.catch(() => [])).map((r) => r.filename)
const cols = await sqlc`SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`
const idx = await sqlc`SELECT tablename, indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname`
const tables = {}
for (const c of cols) (tables[c.table_name] ??= { columns: [], indexes: [] }).columns.push(`${c.column_name}:${c.data_type}:${c.is_nullable === "YES" ? "null" : "notnull"}`)
for (const i of idx) (tables[i.tablename] ??= { columns: [], indexes: [] }).indexes.push(i.indexname)

mkdirSync("db/baseline", { recursive: true })
const header = `-- Anker schema baseline, ${date}. SCHEMA ONLY: no rows, no secrets. Generated from production by scripts/db/make-baseline.mjs (docs/architecture/59 section 4, 75).\n-- Dropped as platform-owned: ${dropped.join("; ") || "nothing"}.\n-- Migrations applied in production when this was taken: ${ledger.length} (db/baseline/${date}.ledger.json). Migrations not in that list are applied on top by scripts/db/build-local.mjs.\n\n`
writeFileSync(`db/baseline/${date}.sql`, header + sql)
writeFileSync(`db/baseline/${date}.ledger.json`, JSON.stringify({ date, applied: ledger }, null, 1) + "\n")
writeFileSync(`db/baseline/${date}.schema.json`, JSON.stringify({ date, tables }, null, 1) + "\n")
console.log(`baseline ${date}: ${Object.keys(tables).length} tables, ${idx.length} indexes, ${ledger.length} ledger entries; dropped ${dropped.length} platform objects`)
