/** Durable, workspace-scoped founder results; available across server instances for 24 hours. */
import { sql } from "@/lib/db"
import type { FounderMatchingResult, StartupProfile } from "./founder-types"
type Scope = { userId: string; orgId: string }
export async function cacheSession(result: FounderMatchingResult, startup: StartupProfile, scope: Scope) {
  await sql`INSERT INTO founder_match_sessions (id,user_id,org_id,result,startup)
    VALUES (${result.sessionId},${scope.userId},${scope.orgId},${JSON.stringify(result)}::jsonb,${JSON.stringify(startup)}::jsonb)`
}
export async function getCachedSession(sessionId: string, scope: Scope): Promise<{ result: FounderMatchingResult; startup: StartupProfile } | null> {
  const [row] = await sql`SELECT result,startup FROM founder_match_sessions
    WHERE id=${sessionId} AND user_id=${scope.userId} AND org_id=${scope.orgId} AND expires_at > now()`
  return row ? { result: row.result, startup: row.startup } : null
}
