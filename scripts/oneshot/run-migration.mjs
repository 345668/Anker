/**
 * Ledger-aware .sql migration runner for the Anker repo.
 *
 * Migrations live as raw .sql files under scripts/migrations/. Every file is
 * IF NOT EXISTS / ON CONFLICT style, so re-runs are safe — but re-running the
 * whole set by hand is slow and error-prone, and nothing recorded what had
 * already run where. This runner keeps a `schema_migrations` ledger so it can
 * apply only what's pending and tell you the difference.
 *
 * Usage (NEON_DATABASE_URL must be set):
 *   node scripts/oneshot/run-migration.mjs --status            # list applied / pending
 *   node scripts/oneshot/run-migration.mjs --all               # apply every pending file
 *   node scripts/oneshot/run-migration.mjs <path/to/file.sql>  # apply one file
 *   node scripts/oneshot/run-migration.mjs --backfill          # mark ALL files applied
 *                                                              #   WITHOUT running them
 *                                                              #   (seed the ledger on a
 *                                                              #   DB already at head)
 *
 * The ledger table is created on first run (ensureLedger).
 */
import { readFile, readdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { neon } from "@neondatabase/serverless"

const url = process.env.NEON_DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing"); process.exit(1) }
const sql = neon(url)

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(HERE, "..", "migrations")

const arg = process.argv[2]
if (!arg) {
  console.error("Usage: run-migration.mjs <file.sql> | --all | --status | --backfill")
  process.exit(1)
}

await ensureLedger()

if (arg === "--status") {
  await status()
} else if (arg === "--all") {
  await applyAllPending()
} else if (arg === "--backfill") {
  await backfill()
} else {
  await applyOne(arg)
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function status() {
  const files = await migrationFiles()
  const applied = await appliedSet()
  console.log(`${files.length} migration file(s); ${applied.size} recorded applied.\n`)
  for (const f of files) {
    console.log(`  ${applied.has(f) ? "✓ applied" : "· PENDING"}   ${f}`)
  }
  const pending = files.filter((f) => !applied.has(f))
  console.log(`\n${pending.length} pending.`)
}

async function applyAllPending() {
  const files = await migrationFiles()
  const applied = await appliedSet()
  const pending = files.filter((f) => !applied.has(f))
  if (!pending.length) { console.log("Nothing to apply — all migrations recorded."); return }
  console.log(`Applying ${pending.length} pending migration(s)…\n`)
  for (const f of pending) await applyOne(path.join(MIGRATIONS_DIR, f))
  console.log("\nAll pending migrations applied.")
}

async function applyOne(file) {
  const abs = path.isAbsolute(file) ? file : path.join(process.cwd(), file)
  const name = path.basename(abs)
  const applied = await appliedSet()
  if (applied.has(name)) { console.log(`↷ ${name} already applied — skipping.`); return }

  const raw = await readFile(abs, "utf8")
  const clean = raw.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n")
  const stmts = splitSql(clean).map((s) => s.trim()).filter(Boolean)

  console.log(`Applying ${stmts.length} statement(s) from ${name}…`)
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
  await record(name, raw)
  console.log(`  recorded ${name} in schema_migrations.\n`)
}

/** Mark every migration file as applied WITHOUT running it. Use once, on a DB
 *  already at head, to seed the ledger. Idempotent. */
async function backfill() {
  const files = await migrationFiles()
  const applied = await appliedSet()
  let added = 0
  for (const f of files) {
    if (applied.has(f)) continue
    const raw = await readFile(path.join(MIGRATIONS_DIR, f), "utf8")
    await record(f, raw)
    added++
    console.log(`  recorded ${f}`)
  }
  console.log(`\nBackfill complete — ${added} newly recorded, ${applied.size} already present.`)
}

// ─── Ledger helpers ──────────────────────────────────────────────────────────

async function ensureLedger() {
  await sql`
    create table if not exists schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now(),
      checksum    text
    )
  `
}

async function appliedSet() {
  const rows = await sql`select filename from schema_migrations`
  return new Set(rows.map((r) => r.filename))
}

async function record(filename, contents) {
  const checksum = createHash("sha256").update(contents).digest("hex")
  await sql`
    insert into schema_migrations (filename, checksum)
    values (${filename}, ${checksum})
    on conflict (filename) do update set checksum = excluded.checksum, applied_at = now()
  `
}

async function migrationFiles() {
  const all = await readdir(MIGRATIONS_DIR)
  return all.filter((f) => f.endsWith(".sql")).sort()
}

// ─── SQL splitter (respects $$…$$ dollar-quotes and '…' string literals) ─────

function splitSql(src) {
  const out = []
  let buf = ""
  let inSingle = false
  let dollarTag = null
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
    if (c === "$") {
      const m = src.slice(i).match(/^\$([A-Za-z_][A-Za-z0-9_]*)?\$/)
      if (m) { dollarTag = m[0]; buf += m[0]; i += m[0].length - 1; continue }
    }
    if (c === ";") { out.push(buf); buf = ""; continue }
    buf += c
  }
  if (buf.trim()) out.push(buf)
  return out
}
