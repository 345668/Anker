/**
 * Checks every migration file against the database (docs/architecture/59 R1). Read-only unless --record.
 *   node scripts/migrate-verify.mjs              # every file: applied / partial / absent / unknown, and whether the ledger agrees
 *   node scripts/migrate-verify.mjs --record     # also record the files that are fully applied and missing from the ledger
 * Exits 1 when any file is partial, or recorded in the ledger yet absent: those need a person.
 */
import { readFile, readdir } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { neon } from "@neondatabase/serverless"
import { loadEnvFiles, hostOf } from "./lib/load-env.mjs"
import { extractObjects, keyOf } from "./lib/migration-sql.mjs"
import { readCatalog, verdictFor } from "./lib/migration-probe.mjs"

loadEnvFiles()
const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing (set it, or add it to .env.local)"); process.exit(1) }
const sql = neon(url)
const RECORD = process.argv.includes("--record")
const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations")

const KNOWN = JSON.parse(readFileSync(path.join(DIR, "..", "migrations-known-drift.json"), "utf8")).files
console.log(`Database: ${hostOf(url)}${RECORD ? "   (will record fully applied files missing from the ledger)" : "   (read-only)"}\n`)
await sql`create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now(), checksum text)`
const ledger = new Set((await sql`select filename from schema_migrations`).map((r) => r.filename))
const cat = await readCatalog((q) => sql.query(q))
const files = (await readdir(DIR)).filter((f) => f.endsWith(".sql")).sort()
const parsed = []
for (const f of files) parsed.push({ f, raw: await readFile(path.join(DIR, f), "utf8"), ...extractObjects(await readFile(path.join(DIR, f), "utf8")) })
// What each file may expect to find: not what a later file dropped or renamed.
const droppedAfter = (i) => { const s = new Set(); for (let j = i; j < parsed.length; j++) for (const o of parsed[j].dropped) s.add(keyOf(o)); return s }

const rows = []
for (let i = 0; i < parsed.length; i++) {
  const { f, raw, created } = parsed[i]
  const r = verdictFor(created, cat, droppedAfter(i))
  rows.push({ f, raw, ledger: ledger.has(f), ...r })
}
const mark = { applied: "✓", partial: "!", absent: "✗", unknown: "?" }
let bad = 0, recorded = 0
for (const r of rows) {
  const lies = (r.ledger && (r.verdict === "absent" || r.verdict === "partial")) || (!r.ledger && r.verdict === "applied")
  const interesting = r.verdict === "partial" || r.verdict === "absent" || r.verdict === "unknown" || !r.ledger
  if (!interesting) continue
  console.log(`${mark[r.verdict]} ${r.verdict.padEnd(8)} ${r.ledger ? "recorded    " : "NOT recorded"}  ${r.f}`)
  if (r.verdict === "partial" || (r.verdict === "absent" && r.ledger)) {
    if (KNOWN[r.f]) console.log(`      known drift: ${KNOWN[r.f]}`)
    else { bad++; for (const m of r.missing.slice(0, 8)) console.log(`      missing: ${m}`) }
  }
  if (RECORD && !r.ledger && r.verdict === "applied") {
    await sql`insert into schema_migrations (filename, checksum) values (${r.f}, ${createHash("sha256").update(r.raw).digest("hex")}) on conflict (filename) do nothing`
    recorded++; console.log("      recorded (reconciled by probe)")
  }
  void lies
}
const count = (v) => rows.filter((r) => r.verdict === v).length
console.log(`\n${rows.length} files: ${count("applied")} applied, ${count("partial")} partial, ${count("absent")} absent, ${count("unknown")} unknown (data only or not readable: look by hand).`)
const unrecorded = rows.filter((r) => !r.ledger && !(RECORD && r.verdict === "applied")).length
console.log(`Ledger: ${ledger.size + recorded} recorded; ${unrecorded} file(s) not recorded${RECORD ? "" : " (run with --record to record the fully applied ones)"}.`)
if (bad) { console.log(`\n${bad} file(s) need a person: partial, or recorded but absent, and not on the known-drift list.`); process.exit(1) }
