/**
 * Retired: the 24-hour JSONB session cache. Founder results are now persisted
 * as runs and result rows (./founder-runs.ts, docs/architecture/14 §6). These
 * wrappers keep old imports working.
 */
import type { FounderMatchingResult, StartupProfile } from "./founder-types"
import { saveRun, allResults, toMatchingResult, type Scope } from "./founder-runs"

export async function cacheSession(result: FounderMatchingResult, startup: StartupProfile, scope: Scope) {
  await saveRun(result, startup, scope)
}

export async function getCachedSession(sessionId: string, scope: Scope): Promise<{ result: FounderMatchingResult; startup: StartupProfile } | null> {
  const data = await allResults(sessionId, scope)
  return data ? { result: toMatchingResult(data), startup: data.run.startup } : null
}
