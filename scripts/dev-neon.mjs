/**
 * Run `next dev` against Neon instead of the local Postgres.
 *
 *   node scripts/dev-neon.mjs
 *
 * Why this exists: .env.local sets DATABASE_URL to localhost:5432/anker, and
 * lib/db/index.ts prefers DATABASE_URL over NEON_DATABASE_URL — so unless a local
 * Postgres is running, every database-backed page in dev fails with an
 * AggregateError from pg-pool rather than anything that names the cause.
 *
 * Note the precedence is the opposite of the one the tooling uses:
 *
 *   lib/db/index.ts                    DATABASE_URL || NEON_DATABASE_URL
 *   scripts/oneshot/run-migration.mjs  NEON_DATABASE_URL || DATABASE_URL
 *   scripts/checks/run-check.mjs       NEON_DATABASE_URL || DATABASE_URL
 *
 * which is why migrations and checks reach Neon while the dev app cannot. This
 * script does not try to settle that; it overrides DATABASE_URL for one process
 * and leaves .env.local alone.
 *
 * THIS POINTS DEV AT THE PRODUCTION DATABASE. Writes from a local dev server land
 * in production data. That is sometimes what you want (running a real match) and
 * frequently not.
 */
import { spawn } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")

function readEnvFile(name) {
  const out = {}
  let text
  try { text = readFileSync(path.join(REPO_ROOT, name), "utf8") } catch { return out }
  for (let line of text.split("\n")) {
    line = line.trim()
    if (!line || line.startsWith("#")) continue
    if (line.startsWith("export ")) line = line.slice(7).trim()
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if (val.length >= 2 && ((val[0] === '"' && val.at(-1) === '"') || (val[0] === "'" && val.at(-1) === "'"))) {
      val = val.slice(1, -1)
    }
    if (key) out[key] = val
  }
  return out
}

const fromFiles = { ...readEnvFile(".env"), ...readEnvFile(".env.local") }
const neon = process.env.NEON_DATABASE_URL || fromFiles.NEON_DATABASE_URL

if (!neon) {
  console.error("NEON_DATABASE_URL is not set in the environment or .env.local — nothing to point at.")
  process.exit(1)
}

let host = "unknown"
try { host = new URL(neon).host } catch {}
console.log(`[dev-neon] DATABASE_URL → ${host}`)
console.log("[dev-neon] This dev server writes to PRODUCTION data.\n")

// A real environment variable wins over .env.local in Next, so setting it here is
// enough — the file itself is untouched.
const child = spawn("pnpm", ["dev"], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: neon },
})

child.on("exit", (code) => process.exit(code ?? 0))
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => child.kill(sig))
