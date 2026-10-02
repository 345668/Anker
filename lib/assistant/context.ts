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
/**
 * The run-scoped budget (doc 33).
 *
 * `spendUsd` accumulates only calls that could actually be priced. `pricedCalls`
 * and `unpricedCalls` are what let a reader tell a cheap run from an unmeasured
 * one — without them, "$0.00" is ambiguous between the two, and a run made
 * entirely of unpriced frontier calls would look like the cheapest run of the day.
 */
export interface AiRunBudget {
  /** Per-run ceiling in USD, or null for "no money ceiling on this run". */
  maxSpendUsd: number | null
  spendUsd: number
  pricedCalls: number
  unpricedCalls: number
}

/** The most recent typed AI failure in this run (doc 35). Set by provider.ts, read by
 *  whoever has to explain a run that produced nothing. */
export type AiRunFailure = import("@/lib/ai/failure").AiFailure
const context = new AsyncLocalStorage<{principal: AiPrincipal; signal?: AbortSignal; deadline: number; modelCalls: number; batch?: boolean; budget: AiRunBudget; lastFailure?: AiRunFailure}>()
export const currentAiContext = () => context.getStore()

export function withAiContext<T>(
  principal: AiPrincipal,
  run: () => Promise<T>,
  signal?: AbortSignal,
  maxSpendUsd: number | null = null,
) {
  return context.run({
    principal, signal, deadline: Date.now()+240_000, modelCalls: 0,
    // Null by default so an unconfigured caller behaves exactly as before: the
    // deadline and the call cap, and no money ceiling (doc 33 acceptance 6).
    budget: { maxSpendUsd, spendUsd: 0, pricedCalls: 0, unpricedCalls: 0 },
  }, run)
}

/** This run's spend so far — for the response, the event and the panel. */
export const currentRunBudget = (): AiRunBudget | null => currentAiContext()?.budget ?? null

/**
 * Add one call's cost to the run. Never throws: charging is bookkeeping, and the
 * refusal belongs to checkAiBudget, which runs BEFORE the next call rather than
 * after this one. A single call that blows the ceiling on its own still happens
 * once — its cost is unknowable until it returns — and that is the documented
 * floor of this mechanism (doc 33 §3).
 */
export function chargeAiBudget(costUsd: number | null) {
  const ctx = currentAiContext()
  if (!ctx) return
  if (costUsd === null || !Number.isFinite(costUsd)) { ctx.budget.unpricedCalls++; return }
  ctx.budget.spendUsd += costUsd
  ctx.budget.pricedCalls++
}

/** Thrown when the money ceiling stops a run, so the agent can end it as
 *  `run.ended{reason:"budget"}` rather than as a generic error. */
export class AiBudgetExceeded extends Error {
  constructor(readonly spentUsd: number, readonly limitUsd: number) {
    super(`AI cost ceiling reached for this run ($${spentUsd.toFixed(4)} of $${limitUsd.toFixed(2)}). Narrow the request, or raise the ceiling for this surface.`)
    this.name = "AiBudgetExceeded"
  }
}

/** Model calls one run may make. Loop steps count one each; a batch tool counts by its size
 *  (see runBatch), so a bounded fan-out is not mistaken for a runaway loop. */
export const MAX_MODEL_CALLS = 16
/** One unit per this many prompts in a batch. */
export const BATCH_PROMPTS_PER_UNIT = 10

/**
 * Run a bounded fan-out (one prompt per firm) as ONE budget decision.
 *
 * The call cap exists to stop an agent loop that never ends. A batch tool is the opposite
 * shape: it makes N calls on purpose, N is capped by the tool itself (score_investors takes
 * at most 40), and a run that scores 40 firms is doing its job. Counting each firm as a loop
 * step meant "match me with 50 investors" could never finish: it hit the cap inside the
 * first scoring call (production, 2026-10-02). The batch is charged up front by size, the
 * spend ceiling and the deadline still apply to every call inside it, and the cap still bounds
 * the run: batches that together exceed it are refused.
 */
export async function runBatch<T>(prompts: number, fn: () => Promise<T>): Promise<T> {
  const ctx = currentAiContext()
  if (!ctx) return fn()
  ctx.modelCalls += Math.max(1, Math.ceil(prompts / BATCH_PROMPTS_PER_UNIT))
  if (ctx.modelCalls > MAX_MODEL_CALLS) throw new Error("AI model-call budget reached. Narrow the request and retry.")
  const previous = ctx.batch
  ctx.batch = true
  try { return await fn() } finally { ctx.batch = previous }
}

export function checkAiBudget(modelCall = false) {
  const ctx = currentAiContext()
  if (!ctx) return
  ctx.signal?.throwIfAborted()
  if (Date.now() >= ctx.deadline) throw new Error("AI request time limit reached.")
  if (modelCall && !ctx.batch && ++ctx.modelCalls > MAX_MODEL_CALLS) throw new Error("AI model-call budget reached. Narrow the request and retry.")
  // The money ceiling sits beside the call cap, not instead of it: where spend
  // cannot be measured the call cap is the only bound that still holds, which is
  // doc 29 §7's honest limit and doc 33 §1.3's two versions of it.
  const { maxSpendUsd, spendUsd } = ctx.budget
  if (modelCall && maxSpendUsd !== null && spendUsd >= maxSpendUsd) {
    throw new AiBudgetExceeded(spendUsd, maxSpendUsd)
  }
}
