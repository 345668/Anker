/**
 * DB-editable integration keys (server-only).
 *
 * Resolves an integration key from (in order):
 *   1. the `system_settings` row keyed 'integration_keys_v1' (admin-managed, values
 *      envelope-encrypted at rest — see lib/config/crypto),
 *   2. process.env[NAME] (deployment-time fallback).
 *
 * Mirrors lib/news/runtime-keys.ts (5s in-process cache, verbatim env-var names so DB and
 * env stay greppable) and adds encryption. Only the names below are DB-editable; core
 * secrets (SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET, BLOB_READ_WRITE_TOKEN, DATABASE_URL)
 * are intentionally NOT here and stay env-only.
 */
import "server-only"
import { sql } from "@/lib/db"
import { encryptSecret, decryptSecret, hasEncryptionKey } from "./crypto"

export const INTEGRATION_KEY_NAMES = [
  "RESEND_API_KEY",
  "OPENSANCTIONS_API_KEY",
  "COMPANIES_HOUSE_API_KEY",
  "COMP_BENCHMARK_API_URL",
  "COMP_BENCHMARK_API_KEY",
  "DOCUSIGN_BASE_URI",
  "DOCUSIGN_ACCOUNT_ID",
  "DOCUSIGN_ACCESS_TOKEN",
  "DOC_WORKER_URL",
  "DOC_WORKER_TOKEN",
] as const
export type IntegrationKeyName = (typeof INTEGRATION_KEY_NAMES)[number]
const NAME_SET = new Set<string>(INTEGRATION_KEY_NAMES)
export const isIntegrationKeyName = (n: string): n is IntegrationKeyName => NAME_SET.has(n)

const SETTINGS_KEY = "integration_keys_v1"
const TTL_MS = 5_000
type KeyMap = Partial<Record<IntegrationKeyName, string>>
let _cache: { at: number; map: KeyMap } | null = null

async function ensureSystemSettingsTable(): Promise<void> {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY, value JSONB NOT NULL, description TEXT,
        updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
  } catch (e: any) {
    console.warn("[integration-keys] ensure system_settings:", e?.message)
  }
}

function parseRow(raw: unknown): Record<string, any> {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, any>
  if (typeof raw === "string") { try { return JSON.parse(raw) ?? {} } catch { return {} } }
  return {}
}

/** Read the DB-stored keys (decrypted). Cached 5s; on any error returns {} (env fallback). */
export async function readIntegrationKeys(): Promise<KeyMap> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.map
  const map: KeyMap = {}
  try {
    const rows = await sql`SELECT value FROM system_settings WHERE key = ${SETTINGS_KEY} LIMIT 1`
    const obj = parseRow(rows[0]?.value)
    for (const k of INTEGRATION_KEY_NAMES) {
      const stored = obj[k]
      if (typeof stored !== "string" || !stored) continue
      const plain = decryptSecret(stored) // null if encrypted-but-undecryptable
      if (plain && plain.trim()) map[k] = plain.trim()
    }
  } catch (e: any) {
    console.warn("[integration-keys] read failed (env-only fallback):", e?.message)
  }
  _cache = { at: Date.now(), map }
  return map
}

/** Resolve one key from cache/env (sync — assumes the cache is primed). */
export function getIntegrationKeySync(name: IntegrationKeyName): string | undefined {
  const fromDb = _cache?.map[name]
  if (fromDb) return fromDb
  const fromEnv = process.env[name]
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : undefined
}

/** Resolve one key, priming the cache first. DB value wins over env. */
export async function getIntegrationKey(name: IntegrationKeyName): Promise<string | undefined> {
  await readIntegrationKeys()
  return getIntegrationKeySync(name)
}

/** Where a key's active value comes from — for the admin status UI. */
export type KeySource = "db" | "env" | null
export async function keySource(name: IntegrationKeyName): Promise<KeySource> {
  const map = await readIntegrationKeys()
  if (map[name]) return "db"
  const env = process.env[name]
  return env && env.trim() ? "env" : null
}

export function invalidateIntegrationKeys(): void { _cache = null }

/** users.id FK guard on system_settings.updated_by (mirrors runtime-config). */
async function resolveUpdatedBy(updatedBy?: string | null): Promise<string | null> {
  if (!updatedBy) return null
  try {
    const rows = await sql`SELECT id FROM users WHERE id = ${updatedBy} OR email = ${updatedBy} LIMIT 1` as { id: string }[]
    return rows[0]?.id ?? null
  } catch { return null }
}

/**
 * Upsert integration keys (encrypted). Only writes names actually included; an explicit ""
 * deletes a key (so the env fallback resumes). Requires CONFIG_ENC_KEY — refuses to store
 * plaintext secrets. Names not in INTEGRATION_KEY_NAMES are ignored (hard guard against
 * writing core secrets). Returns the fresh decrypted map.
 */
export async function saveIntegrationKeys(updates: Record<string, string>, updatedBy?: string | null): Promise<KeyMap> {
  if (!hasEncryptionKey()) throw new Error("CONFIG_ENC_KEY is not set — cannot store integration keys encrypted at rest.")
  await ensureSystemSettingsTable()

  let current: Record<string, any> = {}
  try {
    const rows = await sql`SELECT value FROM system_settings WHERE key = ${SETTINGS_KEY} LIMIT 1`
    current = parseRow(rows[0]?.value)
  } catch { current = {} }

  const merged: Record<string, string> = { ...current }
  for (const [k, v] of Object.entries(updates)) {
    if (!isIntegrationKeyName(k)) continue // ignore anything not in the allowlist
    if (typeof v === "string" && v.trim()) merged[k] = encryptSecret(v.trim())
    else delete merged[k]
  }

  const safeUpdatedBy = await resolveUpdatedBy(updatedBy)
  await sql`
    INSERT INTO system_settings (key, value, description, updated_by, updated_at)
    VALUES (${SETTINGS_KEY}, ${JSON.stringify(merged)}::jsonb, 'DB-editable integration keys (encrypted)', ${safeUpdatedBy}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`
  invalidateIntegrationKeys()
  return readIntegrationKeys()
}
