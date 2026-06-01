/**
 * Lightweight in-process cache for founder matching results.
 *
 * The founder flow is exploratory — startups don't always want their full
 * profile + match results persisted to the DB on every run. We keep the
 * last N results in memory keyed by sessionId so the deliverable export
 * routes can render them. Survives until process restart.
 *
 * For production: swap this for a `founder_match_sessions` table.
 */

import type { FounderMatchingResult, StartupProfile } from "./founder-types"

interface CachedSession {
  result: FounderMatchingResult
  startup: StartupProfile
  cachedAt: number
}

const MAX_SESSIONS = 50
const TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

const _cache = new Map<string, CachedSession>()

export function cacheSession(result: FounderMatchingResult, startup: StartupProfile): void {
  // Evict oldest if at capacity
  if (_cache.size >= MAX_SESSIONS) {
    const oldest = [..._cache.entries()].sort((a, b) => a[1].cachedAt - b[1].cachedAt)[0]
    if (oldest) _cache.delete(oldest[0])
  }
  _cache.set(result.sessionId, { result, startup, cachedAt: Date.now() })
}

export function getCachedSession(sessionId: string): CachedSession | null {
  const v = _cache.get(sessionId)
  if (!v) return null
  if (Date.now() - v.cachedAt > TTL_MS) {
    _cache.delete(sessionId)
    return null
  }
  return v
}

export function listCachedSessions(): { sessionId: string; startupName: string; cachedAt: number; totals: any }[] {
  return [..._cache.values()]
    .sort((a, b) => b.cachedAt - a.cachedAt)
    .map((c) => ({
      sessionId: c.result.sessionId,
      startupName: c.result.startupName,
      cachedAt: c.cachedAt,
      totals: c.result.totals,
    }))
}
