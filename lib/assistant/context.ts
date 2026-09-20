import { AsyncLocalStorage } from "node:async_hooks"
import type { Membership, Persona } from "@/lib/org/active"
import type { LpMembership } from "@/lib/portfolio/data-room"

/** Created by server authentication only; never accept this object from clients/models. */
export interface AiPrincipal {
  userId: string
  orgId: string | null
  scopeKey: string
  persona: Persona
  membership: Membership | null
  lpMemberships: LpMembership[]
  canWrite: boolean
  readonly: boolean
  allowedTools: string[] | null
}
const context = new AsyncLocalStorage<{principal: AiPrincipal; signal?: AbortSignal; deadline: number; modelCalls: number}>()
export const currentAiContext = () => context.getStore()
export function withAiContext<T>(principal: AiPrincipal, run: () => Promise<T>, signal?: AbortSignal) {
  return context.run({principal, signal, deadline: Date.now()+240_000, modelCalls: 0}, run)
}
export function checkAiBudget(modelCall = false) {
  const ctx = currentAiContext()
  if (!ctx) return
  ctx.signal?.throwIfAborted()
  if (Date.now() >= ctx.deadline) throw new Error("AI request time limit reached.")
  if (modelCall && ++ctx.modelCalls > 16) throw new Error("AI model-call budget reached. Narrow the request and retry.")
}
