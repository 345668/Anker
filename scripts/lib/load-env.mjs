import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const REPO_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..")

/**
 * Loads .env.local then .env so the migration scripts work without the caller exporting the database URL. Dependency-free. Real environment
 * variables always win: a value already in process.env is never overwritten.
 */
export function loadEnvFiles() {
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

/** The host a database URL points at, for showing the person where a script is about to write. Never the user, password or database name. */
export function hostOf(url) {
  try { return new URL(url).host } catch { return "(unreadable url)" }
}
