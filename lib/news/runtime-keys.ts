/**
 * News-provider runtime keys.
 *
 * Resolves a provider API key from (in order):
 *   1. The system_settings row keyed 'news_providers_v1' (admin-managed via
 *      /dashboard/admin/newsroom/api-keys)
 *   2. process.env[KEY] (deployment-time fallback)
 *
 * Cached in-process for 5 s — same TTL the AI router uses. Admins hit
 * invalidate() after a save to force re-read.
 *
 * The shape lives in system_settings as a JSONB object, e.g.
 *   {
 *     "ALPHA_VANTAGE_API_KEY": "K-abc…",
 *     "FINNHUB_API_KEY":       "fh-…",
 *     ...,
 *     "MASSIVE_API_URL":       "https://…"
 *   }
 * Keys are matched verbatim so the env-var names and the DB names are
 * always the same — easier to grep and audit.
 */

import { sql } from "@/lib/db"

export const NEWS_KEY_NAMES = [
  "ALPHA_VANTAGE_API_KEY",
  "FINNHUB_API_KEY",
  "MARKETAUX_API_KEY",
  "NEWSAPI_KEY",
  "FRED_API_KEY",
  "MASSIVE_API_KEY",
  "MASSIVE_API_URL",
] as const
export type NewsKeyName = (typeof NEWS_KEY_NAMES)[number]

type KeyMap = Partial<Record<NewsKeyName, string>>

let _cache: { at: number; map: KeyMap } | null = null
const TTL_MS = 5_000

export async function readNewsKeys(): Promise<KeyMap> {
  if (_cache && Date.now() - _cache.at < TTL_MS) return _cache.map
  try {
    const rows = await sql`SELECT value FROM system_settings WHERE key = 'news_providers_v1' LIMIT 1`
    const v = rows[0]?.value
    const map: KeyMap = {}
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const k of NEWS_KEY_NAMES) {
        const val = (v as any)[k]
        if (typeof val === "string" && val.trim()) map[k] = val.trim()
      }
    }
    _cache = { at: Date.now(), map }
    return map
  } catch {
    // system_settings might not exist yet — fall back to env-only.
    const map: KeyMap = {}
    _cache = { at: Date.now(), map }
    return map
  }
}

/** Resolve a single key, env-fallback. Sync wrapper around the cached read. */
export function getNewsKeySync(name: NewsKeyName): string | undefined {
  const fromCache = _cache?.map[name]
  if (fromCache) return fromCache
  const fromEnv = process.env[name]
  return fromEnv && fromEnv.trim() ? fromEnv.trim() : undefined
}

/** Async-safe variant — primes the cache when stale. */
export async function getNewsKey(name: NewsKeyName): Promise<string | undefined> {
  await readNewsKeys()
  return getNewsKeySync(name)
}

export function invalidateNewsKeyCache(): void {
  _cache = null
}

/**
 * Upsert the news_providers_v1 settings row. Only writes the keys the
 * caller actually included; other keys are left intact.
 *
 * Pass an explicit "" (empty string) to delete a key — useful for
 * rotating a key out of DB so the env-var fallback kicks back in.
 */
export async function saveNewsKeys(updates: Partial<Record<NewsKeyName, string>>): Promise<KeyMap> {
  // Read current value, merge, write back.
  const current = (await sql`SELECT value FROM system_settings WHERE key = 'news_providers_v1' LIMIT 1`)[0]?.value ?? {}
  const merged: Record<string, string | undefined> = { ...(current as any) }
  for (const k of NEWS_KEY_NAMES) {
    if (k in updates) {
      const v = updates[k]
      if (typeof v === "string" && v.trim()) merged[k] = v.trim()
      else delete merged[k]
    }
  }
  await sql`
    INSERT INTO system_settings (key, value, description)
    VALUES ('news_providers_v1', ${JSON.stringify(merged)}::jsonb,
            'News-provider API keys for the newsroom sources surface')
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `
  invalidateNewsKeyCache()
  const refreshed = await readNewsKeys()
  return refreshed
}
