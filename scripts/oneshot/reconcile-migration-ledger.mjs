/**
 * Reconcile schema_migrations with what the database actually contains.
 *
 *   node scripts/oneshot/reconcile-migration-ledger.mjs            # report only
 *   node scripts/oneshot/reconcile-migration-ledger.mjs --apply    # record the settled ones
 *
 * Why: the ledger reports PENDING for migrations whose objects are already live.
 * On 2026-09-26 it showed 7 pending, of which 6 were already applied in
 * substance — and the one that genuinely was not had been breaking Anker AI's
 * chat history in production, because the routes filtered on a column the
 * database did not have. A ledger nobody trusts is a ledger nobody reads, and
 * one real failure sat behind six false alarms.
 *
 * This is NOT `--backfill`. That marks every file applied without looking, which
 * would bury exactly the case worth finding. This reads each pending file,
 * extracts the objects it would create, checks them against the live catalog,
 * and classifies:
 *
 *   PRESENT   every object exists        → safe to record as applied
 *   MISSING   no object exists           → genuinely pending, run it
 *   PARTIAL   some exist, some do not    → neither; a human decides
 *
 * Only PRESENT is recorded, and only with --apply. PARTIAL is the dangerous
 * state — a half-applied migration — and is never resolved automatically.
 */
import { readFile, readdir } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { neon } from "@neondatabase/serverless"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(HERE, "..", "migrations")
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
      if (val.length >= 2 && ((val[0] === '"' && val.at(-1) === '"') || (val[0] === "'" && val.at(-1) === "'"))) val = val.slice(1, -1)
      process.env[key] = val
    }
  }
}
loadEnvFiles()

const APPLY = process.argv.includes("--apply")
const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

/**
 * The objects a migration would create.
 *
 * Only CREATE-shaped statements count as evidence. An `ALTER … DROP NOT NULL`,
 * an UPDATE or a backfill leaves nothing to look for, so a file made only of
 * those is reported as UNVERIFIABLE rather than guessed at.
 */
function objectsIn(sqlText) {
  const s = sqlText.replace(/--[^\n]*/g, " ")
  const out = []
  const add = (kind, name, extra) => name && out.push({ kind, name: name.toLowerCase(), extra })
  for (const m of s.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) add("table", m[1])
  for (const m of s.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([a-z_][a-z0-9_]*)/gi)) add("view", m[1])
  for (const m of s.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) add("index", m[1])
  for (const m of s.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([a-z_][a-z0-9_]*)/gi)) add("function", m[1])
  for (const m of s.matchAll(/CREATE\s+TRIGGER\s+([a-z_][a-z0-9_]*)/gi)) add("trigger", m[1])
  // One ALTER TABLE can add many columns:
  //
  //   ALTER TABLE t
  //     ADD COLUMN IF NOT EXISTS a text,
  //     ADD COLUMN IF NOT EXISTS b text;
  //
  // Matching `ALTER TABLE <t> ADD COLUMN <c>` adjacently finds only `a`, so the
  // rest of the file looks like it needs nothing — and a verifier that
  // under-detects reports a false PRESENT, which is worse than the drift it is
  // meant to fix. Take the whole statement, then every ADD COLUMN inside it.
  for (const stmt of s.matchAll(/ALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)([\s\S]*?);/gi)) {
    const table = stmt[1].toLowerCase()
    for (const col of stmt[2].matchAll(/ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi)) {
      add("column", col[1], table)
    }
  }
  // De-duplicate: a file may create and then index the same name.
  const seen = new Set()
  return out.filter((o) => {
    const k = `${o.kind}:${o.extra ?? ""}:${o.name}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

async function liveCatalog() {
  const [tables, columns, indexes, routines, triggers, views] = await Promise.all([
    sql`SELECT table_name AS n FROM information_schema.tables WHERE table_schema='public'`,
    sql`SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema='public'`,
    sql`SELECT indexname AS n FROM pg_indexes WHERE schemaname='public'`,
    sql`SELECT routine_name AS n FROM information_schema.routines WHERE routine_schema='public'`,
    sql`SELECT trigger_name AS n FROM information_schema.triggers WHERE trigger_schema='public'`,
    sql`SELECT table_name AS n FROM information_schema.views WHERE table_schema='public'`,
  ])
  return {
    table: new Set(tables.map((r) => r.n.toLowerCase())),
    column: new Set(columns.map((r) => `${r.t.toLowerCase()}.${r.c.toLowerCase()}`)),
    index: new Set(indexes.map((r) => r.n.toLowerCase())),
    function: new Set(routines.map((r) => r.n.toLowerCase())),
    trigger: new Set(triggers.map((r) => r.n.toLowerCase())),
    view: new Set(views.map((r) => r.n.toLowerCase())),
  }
}

const exists = (cat, o) =>
  o.kind === "column" ? cat.column.has(`${o.extra}.${o.name}`)
  : o.kind === "view" ? cat.view.has(o.name) || cat.table.has(o.name)
  : cat[o.kind]?.has(o.name) ?? false

let host = "unknown"
try { host = new URL(url).host } catch {}
console.log(`${APPLY ? "APPLY" : "REPORT"} → ${host}\n`)

await sql`create table if not exists schema_migrations (filename text primary key, applied_at timestamptz not null default now(), checksum text)`
const applied = new Set((await sql`select filename from schema_migrations`).map((r) => r.filename))
const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort()
const pending = files.filter((f) => !applied.has(f))

if (!pending.length) { console.log("Ledger is clean — nothing pending."); process.exit(0) }

const cat = await liveCatalog()
const verdicts = []
for (const f of pending) {
  const text = await readFile(path.join(MIGRATIONS_DIR, f), "utf8")
  const objects = objectsIn(text)
  if (!objects.length) { verdicts.push({ f, state: "UNVERIFIABLE", objects, missing: [] }); continue }
  const missing = objects.filter((o) => !exists(cat, o))
  const state = missing.length === 0 ? "PRESENT" : missing.length === objects.length ? "MISSING" : "PARTIAL"
  verdicts.push({ f, state, objects, missing })
}

const label = { PRESENT: "already applied", MISSING: "genuinely pending", PARTIAL: "HALF APPLIED", UNVERIFIABLE: "nothing to verify" }
for (const v of verdicts) {
  console.log(`${v.state.padEnd(13)} ${v.f}`)
  console.log(`              ${v.objects.length} object(s); ${label[v.state]}`)
  if (v.missing.length) {
    for (const m of v.missing.slice(0, 6)) console.log(`              missing: ${m.kind} ${m.extra ? `${m.extra}.` : ""}${m.name}`)
    if (v.missing.length > 6) console.log(`              …and ${v.missing.length - 6} more`)
  }
}

const settled = verdicts.filter((v) => v.state === "PRESENT")
const partial = verdicts.filter((v) => v.state === "PARTIAL")
const real = verdicts.filter((v) => v.state === "MISSING")
const unknown = verdicts.filter((v) => v.state === "UNVERIFIABLE")

console.log(`\n${settled.length} already applied · ${real.length} genuinely pending · ${partial.length} half applied · ${unknown.length} unverifiable`)

if (partial.length) {
  console.log("\nHALF-APPLIED migrations are not reconciled automatically.")
  console.log("Some of their objects exist and some do not, so neither recording nor")
  console.log("re-running is safe without reading the file. Resolve these by hand.")
}
if (real.length) {
  console.log("\nGenuinely pending — run each deliberately, checking its header first:")
  for (const v of real) console.log(`  node scripts/oneshot/run-migration.mjs scripts/migrations/${v.f}`)
}
if (unknown.length) {
  console.log("\nUnverifiable (backfills, DROP NOT NULL, data-only) — these create no")
  console.log("object to look for, so only the file itself can say whether it ran.")
}

if (!APPLY) {
  console.log(`\nReport only. Re-run with --apply to record the ${settled.length} already-applied migration(s).`)
  process.exit(0)
}
if (!settled.length) { console.log("\nNothing safe to record."); process.exit(0) }

for (const v of settled) {
  const raw = await readFile(path.join(MIGRATIONS_DIR, v.f), "utf8")
  const checksum = createHash("sha256").update(raw).digest("hex")
  await sql`insert into schema_migrations (filename, checksum) values (${v.f}, ${checksum})
            on conflict (filename) do update set checksum = excluded.checksum, applied_at = now()`
  console.log(`  recorded ${v.f}`)
}
console.log(`\nRecorded ${settled.length}. ${real.length + partial.length + unknown.length} still need a human.`)
