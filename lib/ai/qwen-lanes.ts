/**
 * Qwen credential lanes: spend the free allowance first, then the plan. Doc 35.
 *
 * Alibaba Model Studio gives each model its own free allowance on a pay-as-you-go
 * key, and sells a separate fixed-price "token plan" key on a different endpoint
 * with a short list of models. The wish is to use the free allowances until they
 * run out, model by model, and only then move to the plan:
 *
 *   free lane  (pay-as-you-go key, standard endpoint, free-tier models only)
 *      each model is tried in its tier order; one whose free allowance is spent
 *      is remembered as exhausted and skipped, and the next free model is used
 *   plan lane  (token-plan key, its own endpoint, the plan's models)
 *      reached when every free model for the task is exhausted
 *   then the other configured providers, as before
 *
 * Configuration (all environment, so nothing here needs a SAIL change):
 *   QWEN_FREE_API_KEY      the pay-as-you-go key (falls back to the saved Qwen key,
 *                          then DASHSCOPE_API_KEY / QWEN_API_KEY)
 *   QWEN_PLAN_API_KEY      the token-plan key; enables the plan lane
 *   QWEN_PLAN_BASE_URL     default https://coding-intl.dashscope.aliyuncs.com/v1
 *   QWEN_PLAN_MODEL_<TIER> comma list per tier (FAST | BALANCED | DEEP | REASON)
 *   QWEN_PLAN_MODELS       comma list of every model the plan serves (explicit picks)
 * With neither lane variable set there is ONE lane, exactly as before this file.
 *
 * What this cannot do, and the operator must: a free allowance that runs out on a
 * pay-as-you-go key is BILLED unless the console's "free quota only" mode is on for
 * that model, in which case the API answers 403 AllocationQuota.FreeTierOnly. That
 * response is the signal this module acts on. Nothing in code can see a balance.
 */
import { MODEL_CATALOG } from "./model-catalog"
import type { TaskTag, ModelTier } from "./model-router"
import { TASK_TIER } from "./model-router"
import { resolveQwenEndpoint } from "./qwen-endpoint"

export type QwenLaneId = "default" | "free" | "plan"

export interface QwenLane {
  id: QwenLaneId
  apiKey: string
  baseUrl: string
}

type Env = Record<string, string | undefined>
export interface LaneConfig { qwenApiKey?: string | null; qwenRegion?: string | null; qwenWorkspaceId?: string | null }

const PLAN_BASE_DEFAULT = "https://coding-intl.dashscope.aliyuncs.com/v1"

/** What the plan endpoint's public model list reported on 2026-10-02. Override with
 *  QWEN_PLAN_MODELS when the plan changes; this is only the fallback. */
const PLAN_MODELS_DEFAULT = [
  "qwen3-coder-plus", "qwen3-max-2026-01-23", "qwen3-coder-next", "glm-4.7", "kimi-k2.5",
  "qwen3.5-plus", "glm-5", "MiniMax-M2.5", "qwen3.6-plus", "qwen3.7-plus",
]

const PLAN_TIER_DEFAULTS: Record<ModelTier, string[]> = {
  fast: ["qwen3.7-plus"],
  balanced: ["qwen3.6-plus", "qwen3.5-plus"],
  deep: ["qwen3-max-2026-01-23", "glm-5"],
  reason: ["qwen3.7-plus", "qwen3-max-2026-01-23"],
}

const csv = (v: string | undefined): string[] | null => {
  const l = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  return l.length ? l : null
}

/** Models the catalogue marks as having a free allowance on the DashScope API. */
const FREE_TIER = new Set(MODEL_CATALOG.filter((m) => m.provider === "dashscope" && m.freeTier).map((m) => m.id))
export const isFreeTierModel = (id: string): boolean => FREE_TIER.has(id)

export function planModels(env: Env = process.env): Set<string> {
  return new Set(csv(env.QWEN_PLAN_MODELS) ?? PLAN_MODELS_DEFAULT)
}

/** True when either lane variable is present, i.e. the two-lane behaviour is on. */
export const lanesConfigured = (env: Env = process.env): boolean =>
  !!(env.QWEN_FREE_API_KEY?.trim() || env.QWEN_PLAN_API_KEY?.trim())

/** The lanes to try, in order. Empty when there is no Qwen key at all. */
export function qwenLanes(cfg: LaneConfig | null, env: Env = process.env): QwenLane[] {
  const freeKey = env.QWEN_FREE_API_KEY?.trim() || cfg?.qwenApiKey || env.DASHSCOPE_API_KEY || env.QWEN_API_KEY || null
  const planKey = env.QWEN_PLAN_API_KEY?.trim() || null
  const standard = resolveQwenEndpoint({
    region: cfg?.qwenRegion ?? null,
    workspaceId: cfg?.qwenWorkspaceId || env.QWEN_WORKSPACE_ID || null,
    env,
  }).baseUrl

  if (!lanesConfigured(env)) {
    return freeKey ? [{ id: "default", apiKey: freeKey, baseUrl: standard }] : []
  }
  const lanes: QwenLane[] = []
  if (freeKey) lanes.push({ id: "free", apiKey: freeKey, baseUrl: standard })
  if (planKey) lanes.push({ id: "plan", apiKey: planKey, baseUrl: (env.QWEN_PLAN_BASE_URL?.trim() || PLAN_BASE_DEFAULT).replace(/\/+$/, "") })
  return lanes
}

/**
 * The models a lane may call for this request.
 *
 * `chain` is the caller's ordered Qwen candidates (explicit pick, saved override,
 * tier chain). The free lane keeps only free-tier models — never knowingly send a
 * paid-only model down the pay-as-you-go key. The plan lane replaces the chain with
 * its own tier lists, since the standard tier chains name models the plan does not
 * serve. A single-lane setup returns the chain unchanged.
 */
export function laneModels(
  lane: QwenLane,
  chain: string[],
  opts: { model?: string; task?: TaskTag },
  env: Env = process.env,
): string[] {
  if (lane.id === "default") return chain
  if (lane.id === "free") return chain.filter(isFreeTierModel)
  const allowed = planModels(env)
  if (opts.model) return allowed.has(opts.model) ? [opts.model] : []
  const tier = TASK_TIER[opts.task as TaskTag] ?? "balanced"
  const tierList = csv(env[`QWEN_PLAN_MODEL_${tier.toUpperCase()}`]) ?? PLAN_TIER_DEFAULTS[tier]
  // A saved per-task model that the plan serves still leads, as it does elsewhere.
  const lead = chain.find((m) => allowed.has(m) && !tierList.includes(m) && chain.indexOf(m) === 0)
  return [...new Set([...(lead ? [lead] : []), ...tierList])]
}

// ─── exhausted-model memory ───────────────────────────────────────────────
// Per server instance, deliberately. Sharing it would need shared state, and the
// cost of not sharing is one cheap 403 per model per cold instance. The TTL is
// short because an allowance can be topped up or renewed without any signal here.
const EXHAUSTED_TTL_MS = Number(process.env.QWEN_EXHAUSTED_TTL_MS ?? 30 * 60_000)
const exhausted = new Map<string, number>()
const keyOf = (lane: QwenLaneId, model: string) => `${lane}:${model}`

export function markQwenExhausted(lane: QwenLaneId, model: string, now = Date.now()): void {
  exhausted.set(keyOf(lane, model), now + EXHAUSTED_TTL_MS)
}
export function isQwenExhausted(lane: QwenLaneId, model: string, now = Date.now()): boolean {
  const until = exhausted.get(keyOf(lane, model))
  if (until === undefined) return false
  if (until <= now) { exhausted.delete(keyOf(lane, model)); return false }
  return true
}
export function clearQwenExhausted(): void { exhausted.clear() }

/** For diagnostics: which models are being skipped, and until when. No keys. */
export function qwenLaneStatus(cfg: LaneConfig | null, env: Env = process.env, now = Date.now()) {
  return {
    mode: lanesConfigured(env) ? "lanes" : "single",
    lanes: qwenLanes(cfg, env).map((l) => ({
      id: l.id,
      baseUrl: l.baseUrl,
      exhausted: [...exhausted.entries()]
        .filter(([k, until]) => k.startsWith(`${l.id}:`) && until > now)
        .map(([k, until]) => ({ model: k.slice(l.id.length + 1), retryAt: new Date(until).toISOString() })),
    })),
  }
}

/**
 * Has this response said "the free allowance for this model is spent"?
 *
 * Distinguished from a rate limit, which is transient and must NOT mark a model
 * exhausted: DashScope answers a spent free allowance with 403
 * `AllocationQuota.FreeTierOnly` and a quota overrun with 429
 * `Throttling.AllocationQuota`, while a plain rate limit is 429
 * `Throttling.RateQuota` ("Requests rate limit exceeded").
 */
export function isFreeAllowanceExhausted(status: number | undefined, error: string | null | undefined): boolean {
  const e = (error ?? "").toLowerCase()
  if (/requests rate limit|rate.?quota|too many requests/.test(e) && !/free|allocat/.test(e)) return false
  if (/free.?tier|allocation.?quota|free allocated quota|quota.*(exhaust|exceed)|exhaust/.test(e)) return true
  return false
}

/** A failure that says the whole KEY is unusable (bad key, wrong region, account in
 *  arrears), so the rest of this lane's models would fail identically. */
export function isLaneFailure(error: string | null | undefined): boolean {
  return /api key|unauthoriz|\b401\b|invalid.?api|arrearage|good standing/i.test(error ?? "")
}
