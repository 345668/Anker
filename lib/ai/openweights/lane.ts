import "server-only"
import { sql } from "@/lib/db"
import { createBreaker, type Breaker } from "./breaker"
import { clearance } from "./licences"
import { planChain, type LaneState } from "./policy"

/**
 * The open-weights lane (docs/architecture/53 P1): language models we run ourselves behind our own gateway (services/openweights-gateway), reached through an OpenAI-style API.
 * Off until a person turns on the platform flag `ai_openweights` AND sets the endpoint, a key and a licence-cleared model. It never sends anything anywhere by itself.
 * Settings (until SAIL has a page for them): OPENWEIGHTS_BASE_URL, OPENWEIGHTS_API_KEY, OPENWEIGHTS_MODEL_FAST, OPENWEIGHTS_MODEL_BALANCED (optional),
 * OPENWEIGHTS_EVAL_PASSED (comma-separated task names whose evaluation passed), OPENWEIGHTS_TIMEOUT_MS (default 45,000: covers a cold start).
 */
export interface LaneConfig { baseUrl: string; apiKey: string; modelFast: string; modelBalanced: string; evalPassed: string[]; timeoutMs: number }
export function laneConfig(env: Record<string, string | undefined> = process.env): LaneConfig {
  const fast = (env.OPENWEIGHTS_MODEL_FAST ?? "").trim()
  return {
    baseUrl: (env.OPENWEIGHTS_BASE_URL ?? "").trim().replace(/\/+$/, ""), apiKey: (env.OPENWEIGHTS_API_KEY ?? "").trim(), modelFast: fast, modelBalanced: (env.OPENWEIGHTS_MODEL_BALANCED ?? "").trim() || fast,
    evalPassed: (env.OPENWEIGHTS_EVAL_PASSED ?? "").split(",").map((s) => s.trim()).filter(Boolean), timeoutMs: Math.max(5_000, Math.min(120_000, Number(env.OPENWEIGHTS_TIMEOUT_MS) || 45_000)),
  }
}
/** The model for a task's tier: fast tasks use the fast model; everything else the balanced one (which falls back to the fast one). */
export const modelFor = (c: LaneConfig, tier: string | undefined) => (tier === "fast" ? c.modelFast : c.modelBalanced)

export interface LaneStatus { configured: boolean; cleared: boolean; reason: string | null; breaker: string; flagOn: boolean }
export const breaker: Breaker = createBreaker({ threshold: 3, coolMs: 60_000 })

let flagCache: { at: number; on: boolean } | null = null
export const _resetLane = () => { flagCache = null }
export async function flagOn(now = Date.now()): Promise<boolean> {
  if (flagCache && now - flagCache.at < 30_000) return flagCache.on
  let on = false
  try { const [r] = (await sql`SELECT enabled FROM platform_flags WHERE key = 'ai_openweights'`) as any[]; on = !!r?.enabled } catch { on = false }
  flagCache = { at: now, on }; return on
}
export function status(c: LaneConfig = laneConfig(), on = false): LaneStatus {
  const configured = !!(c.baseUrl && c.apiKey && c.modelFast)
  const cl = clearance(c.modelFast)
  const balanced = c.modelBalanced && c.modelBalanced !== c.modelFast ? clearance(c.modelBalanced) : cl
  const cleared = cl.ok && balanced.ok
  return { configured, cleared, reason: !on ? "The platform flag ai_openweights is off." : !configured ? "The endpoint, key or model is not set." : !cl.ok ? cl.reason : !balanced.ok ? balanced.reason : null, breaker: breaker.state(), flagOn: on }
}

/** What the routing policy needs, for one call. */
export async function laneState(preset: LaneState["preset"], c: LaneConfig = laneConfig(), now = Date.now()): Promise<LaneState> {
  const on = await flagOn(now), st = status(c, on)
  return { flagOn: on, usable: st.configured && st.cleared, healthy: breaker.state(now) !== "open", evalPassed: c.evalPassed, preset }
}
/** The chain with the lane placed (or removed) by the policy. Runs before the workspace's data policy filter, which is what makes private mode fail closed. */
export async function applyLane(chain: string[], task: string | undefined, preset: LaneState["preset"]): Promise<string[]> {
  if (!chain.includes("openweights") && !(process.env.OPENWEIGHTS_BASE_URL)) return chain      // nothing configured: leave every existing chain exactly as it was
  const s = await laneState(preset)
  if (!s.flagOn && !chain.includes("openweights")) return chain
  return planChain(chain, task, s)
}

export interface LaneResult { text: string; error: string | null; status?: number; model: string; usage?: { promptTokens?: number; outputTokens?: number }; cold?: boolean }
/** One chat completion. A timeout is treated as a cold start, not a failure (the first request after scale-to-zero can take a minute or two). */
export async function runLane(o: { prompt: string; model: string; max: number; temp: number; json?: boolean; signal?: AbortSignal }, c: LaneConfig = laneConfig(), fetchImpl: typeof fetch = fetch): Promise<LaneResult> {
  const model = o.model
  if (!breaker.allow()) return { text: "", error: "The open-weights lane is paused after repeated failures.", model }
  const timeout = AbortSignal.timeout(c.timeoutMs)
  try {
    const res = await fetchImpl(`${c.baseUrl}/v1/chat/completions`, {
      method: "POST", redirect: "error", signal: o.signal ? AbortSignal.any([o.signal, timeout]) : timeout,
      headers: { "Content-Type": "application/json", "x-api-key": c.apiKey },
      body: JSON.stringify({ model, messages: [{ role: "user", content: o.prompt }], max_tokens: o.max, temperature: o.temp, ...(o.json ? { response_format: { type: "json_object" } } : {}) }),
    })
    if (!res.ok) { breaker.failure(); return { text: "", error: `HTTP ${res.status} from the open-weights lane`, status: res.status, model } }
    const data: any = await res.json().catch(() => ({}))
    const text = String(data?.choices?.[0]?.message?.content ?? "").trim()
    if (!text) { breaker.failure(); return { text: "", error: "empty response from the open-weights lane", model } }
    breaker.success()
    const n = (v: unknown) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : undefined)
    return { text, error: null, model, usage: data?.usage ? { promptTokens: n(data.usage.prompt_tokens), outputTokens: n(data.usage.completion_tokens) } : undefined }
  } catch (e: any) {
    if (e?.name === "TimeoutError") { breaker.cold(); return { text: "", error: "The open-weights lane did not answer in time (it may be starting up).", model, cold: true } }
    breaker.failure(); return { text: "", error: String(e?.message ?? e).slice(0, 200), model }
  }
}
