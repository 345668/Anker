/**
 * Ledger-aware .sql migration runner for the Anker repo.
 *
 * Migrations live as raw .sql files under scripts/migrations/. Every file is
 * IF NOT EXISTS / ON CONFLICT style, so re-runs are safe — but re-running the
 * whole set by hand is slow and error-prone, and nothing recorded what had
 * already run where. This runner keeps a `schema_migrations` ledger so it can
 * apply only what's pending and tell you the difference.
 *
 * Usage (reads NEON_DATABASE_URL / DATABASE_URL — auto-loaded from .env.local
 * if not already exported; real env vars take precedence):
 *   node scripts/oneshot/run-migration.mjs --status            # list applied / pending (read-only)
 *   node scripts/oneshot/run-migration.mjs --all               # DRY RUN: shows the host and what would be applied
 *   node scripts/oneshot/run-migration.mjs <path/to/file.sql>  # DRY RUN of one file
 *   ... add --yes-production to a command above to really apply it
 *   node scripts/oneshot/run-migration.mjs --backfill --yes-production
 *                                                              # mark ALL files applied WITHOUT running them
 *                                                              #   (prefer `pnpm migrate:verify --record`, which checks first)
 *
 * (docs/architecture/59) The database is production. A command that would change it only describes the change unless --yes-production is given, and a file that
 * drops or empties anything is refused unless its first line is `-- destructive: <restore point or reason>`.
 *
 * The ledger table is created on first run (ensureLedger).
 */
import { readFile, readdir } from "node:fs/promises"
import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { neon } from "@neondatabase/serverless"
import { loadEnvFiles, hostOf } from "../lib/load-env.mjs"
import { statementsOf, destructiveStatements, hasDestructiveHeader } from "../lib/migration-sql.mjs"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = path.join(HERE, "..", "migrations")

loadEnvFiles()

const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL
if (!url) { console.error("NEON_DATABASE_URL missing (set it, or add it to .env.local)"); process.exit(1) }
const sql = neon(url)

const args = process.argv.slice(2)
const YES = args.includes("--yes-production")
const arg = args.find((a) => a !== "--yes-production")
if (!arg) {
  console.error("Usage: run-migration.mjs <file.sql> | --all | --status | --backfill   [--yes-production]")
  process.exit(1)
}
console.log(`Database: ${hostOf(url)}${YES || arg === "--status" ? "" : "   (dry run: add --yes-production to apply)"}\n`)

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
  const stmts = statementsOf(raw)
  const risky = destructiveStatements(raw)
  if (risky.length && !hasDestructiveHeader(raw)) {
    console.error(`✗ ${name} removes data or structure and has no \`-- destructive: <restore point or reason>\` first line:\n${risky.map((r) => `    ${r}`).join("\n")}`)
    process.exit(1)
  }
  if (!YES) { console.log(`Would apply ${stmts.length} statement(s) from ${name}${risky.length ? " (destructive, header present)" : ""}. Nothing was changed.\n`); return }

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
  if (!YES) { console.log("Dry run. --backfill records every file as applied without running it; use `pnpm migrate:verify --record` to record only what the database really has, or add --yes-production."); return }
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
