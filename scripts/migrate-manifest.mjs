/**
 * Writes lib/migrations/manifest.json: the migration files this version of the code expects the database to have (docs/architecture/59 R3).
 * Run it when a migration file is added. A test fails when the manifest and the folder differ, so a new migration cannot be forgotten.
 */
import { readdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const files = readdirSync(path.join(ROOT, "scripts", "migrations")).filter((f) => f.endsWith(".sql")).sort()
writeFileSync(path.join(ROOT, "lib", "migrations", "manifest.json"), JSON.stringify({ files }, null, 2) + "\n")
console.log(`Manifest: ${files.length} migration files.`)
