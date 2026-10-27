#!/usr/bin/env node
// Builds a database from nothing: the schema baseline, then every migration in the manifest that production had not yet applied when the baseline was taken
// (docs/architecture/59 section 4, 75). Used for local development, CI and the baseline test.
//   node scripts/db/build-local.mjs [dir]      writes a PGlite database to dir (default .local-db); "memory" builds in memory and just reports
import { readFileSync, readdirSync, existsSync, rmSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite/vector"

export async function buildDatabase(dir = "memory", log = () => {}) {
  const baselines = readdirSync("db/baseline").filter((f) => f.endsWith(".sql")).sort()
  const baseline = baselines.at(-1)
  if (!baseline) throw new Error("No baseline in db/baseline")
  const date = baseline.replace(/\.sql$/, "")
  const ledger = new Set(JSON.parse(readFileSync(`db/baseline/${date}.ledger.json`, "utf8")).applied)
  const db = dir === "memory" ? new PGlite({ extensions: { vector } }) : new PGlite(dir, { extensions: { vector } })
  await db.waitReady
  await db.exec("CREATE EXTENSION IF NOT EXISTS vector")
  await db.exec(readFileSync(`db/baseline/${baseline}`, "utf8"))
  log(`baseline ${date} loaded`)
  const manifest = JSON.parse(readFileSync("lib/migrations/manifest.json", "utf8"))
  const files = Object.values(manifest).find(Array.isArray) ?? []
  // The dump ends with an empty search_path; migrations written for production assume the default one.
  await db.exec("SET search_path TO public")
  const newer = files.filter((f) => !ledger.has(f) && existsSync(path.join("scripts/migrations", f)))
  const failed = []
  for (const f of newer) {
    try { await db.exec(readFileSync(path.join("scripts/migrations", f), "utf8")); log(`applied ${f}`) } catch (e) { failed.push({ file: f, error: String(e.message).slice(0, 160) }) }
  }
  return { db, baseline: date, newer, failed }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] || ".local-db"
  if (dir !== "memory" && existsSync(dir) && !process.argv.includes("--force")) { console.error(`${dir} already exists; pass --force to rebuild it.`); process.exit(2) }
  if (dir !== "memory" && process.argv.includes("--force")) rmSync(dir, { recursive: true, force: true })
  const { db, baseline, newer, failed } = await buildDatabase(dir, console.log)
  const [t] = (await db.query("SELECT count(*)::int n FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'")).rows
  console.log(`built from baseline ${baseline}: ${t.n} tables; ${newer.length} newer migrations, ${failed.length} failed`)
  for (const f of failed) console.log(`  FAILED ${f.file}: ${f.error}`)
  await db.close()
  process.exit(failed.length ? 1 : 0)
}
