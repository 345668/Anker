/**
 * Toggle one per-surface routing flag in system_settings.ai_router_v1.
 *
 *   node scripts/oneshot/set-surface-flag.mjs assistant nativeTools true
 *   node scripts/oneshot/set-surface-flag.mjs assistant nativeTools false   # revert
 *   node scripts/oneshot/set-surface-flag.mjs --show
 *
 * Reads the row, merges ONE key, writes it back. It never rebuilds the object
 * the way patchRouterConfig does (doc 31 §1.2), so every other setting —
 * including the encrypted provider keys — passes through untouched and is never
 * printed. Only the `surfaces` map is echoed.
 *
 * Targets the live database (NEON_DATABASE_URL / DATABASE_URL).
 */
import { readFileSync } from "node:fs"
import { neon } from "@neondatabase/serverless"

for (const n of [".env.local", ".env"]) {
  try { for (const l of readFileSync(n, "utf8").split("\n")) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim()
  } } catch {}
}
const sql = neon(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL)

const [surface, key, value] = process.argv.slice(2)
const rows = await sql`SELECT value FROM system_settings WHERE key = 'ai_router_v1' LIMIT 1`
const raw = rows[0]?.value
const cfg = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : {}

if (surface === "--show" || !surface) {
  console.log("surfaces:", JSON.stringify(cfg.surfaces ?? {}, null, 2))
  process.exit(0)
}
const SURFACES = ["chatbot", "assistant", "copilot", "batch"]
if (!SURFACES.includes(surface)) { console.error(`surface must be one of ${SURFACES.join(", ")}`); process.exit(1) }
if (!["true", "false"].includes(value)) { console.error("value must be true or false"); process.exit(1) }

cfg.surfaces = { ...(cfg.surfaces ?? {}) }
cfg.surfaces[surface] = { ...(cfg.surfaces[surface] ?? {}), [key]: value === "true" }

await sql`
  INSERT INTO system_settings (key, value, updated_at)
  VALUES ('ai_router_v1', ${JSON.stringify(cfg)}::jsonb, NOW())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
`
console.log(`set surfaces.${surface}.${key} = ${value}`)
console.log("surfaces now:", JSON.stringify(cfg.surfaces, null, 2))
