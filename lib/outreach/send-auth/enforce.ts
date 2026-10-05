/**
 * Enforcement: with the platform flag `outreach_require_authorization` on, an outreach email that is not being sent under a send authorization is refused at the provider
 * function. docs/architecture/46 §7 P3. Off by default; staff may turn it on only when the log of unauthorized sends has been quiet for two weeks (SAIL checks this).
 * `rollout_pct` applies per sender, by a stable hash, so it can be switched on for a share of senders first. A failed flag read does not block sending (the flag is a
 * guard on top of the gates, not a gate itself, and the gates need the database too).
 */
import { sql } from "@/lib/db"
import { bucketOf } from "@/lib/entitlements/model"
import { currentSendAuthorization, shadowLogUnauthorized } from "./context"

export const ENFORCE_FLAG = "outreach_require_authorization"

export class UnauthorizedSendError extends Error {
  readonly code = "send_unauthorized"
  constructor(readonly via: string) { super("This email was not sent: sending outreach now requires an approved send authorization, and this path has none. Use Review and send, or ask the platform team.") ; this.name = "UnauthorizedSendError" }
}

let cache: { at: number; row: { enabled: boolean; rollout_pct: number } | null } | null = null
export const _resetEnforcementCache = () => { cache = null }

export async function enforcementOn(senderUserId: string | null | undefined, now = Date.now()): Promise<boolean> {
  try {
    if (!cache || now - cache.at > 30_000) {
      const [r] = (await sql`SELECT enabled, rollout_pct FROM platform_flags WHERE key = ${ENFORCE_FLAG}`) as any[]
      cache = { at: now, row: r ? { enabled: !!r.enabled, rollout_pct: Number(r.rollout_pct) } : null }
    }
    const f = cache.row
    return !!f && f.enabled && bucketOf(ENFORCE_FLAG, senderUserId ?? "anonymous") < f.rollout_pct
  } catch { return false }
}

/** Called by the provider functions for every outreach send. Under an authorization it does nothing; otherwise the path is logged, and refused when enforcement is on. */
export async function checkSendAuthorization(via: string | undefined, senderUserId: string | null | undefined): Promise<void> {
  if (currentSendAuthorization()) return
  await shadowLogUnauthorized(via)
  if (await enforcementOn(senderUserId)) throw new UnauthorizedSendError(via ?? "unlabelled")
}
