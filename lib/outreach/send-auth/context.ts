/**
 * Marks code that is sending under a send authorization, so the providers can tell an authorized send from a path nobody has moved yet. docs/architecture/46 §7 P3.
 * Until enforcement is on, a send with no authorization is only logged (`send.unauthorized_path`); the log going quiet for two weeks is the condition for enforcing.
 */
import { AsyncLocalStorage } from "node:async_hooks"

const store = new AsyncLocalStorage<{ authorizationId: string }>()
export const withSendAuthorization = <T>(authorizationId: string, fn: () => Promise<T>): Promise<T> => store.run({ authorizationId }, fn)
export const currentSendAuthorization = (): string | null => store.getStore()?.authorizationId ?? null

const lastLogged = new Map<string, number>()
/** One row per path per minute is enough to know a path is still in use without drowning the audit trail in a 300-recipient update. */
export async function shadowLogUnauthorized(via: string | undefined, now = Date.now()): Promise<void> {
  if (currentSendAuthorization()) return
  const key = via ?? "unlabelled"
  const last = lastLogged.get(key)
  if (last !== undefined && now - last < 60_000) return
  lastLogged.set(key, now)
  try { const { logAudit } = await import("@/lib/audit/audit-log"); await logAudit({ action: "send.unauthorized_path", targetType: "send_path", targetLabel: key, metadata: { via: key } }) } catch { /* shadow logging never blocks a send */ }
}
export const _resetShadowLogForTests = () => lastLogged.clear()
