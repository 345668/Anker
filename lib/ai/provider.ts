import { checkAiBudget, currentAiContext, chargeAiBudget } from "@/lib/assistant/context"
import { costOf } from "./model-catalog"
/**
 * Multi-provider AI shim used by the matching engine + document extractor.
 *
 * Resolves the active provider in this order:
 *   1. AI_PROVIDER env (anthropic | ollama | none) — explicit override
 *   2. ANTHROPIC_API_KEY set & not "stub"     → anthropic
 *   3. Ollama daemon reachable on OLLAMA_URL (default http://127.0.0.1:11434) → ollama
 *   4. none — engines fall back to deterministic / rule-based output
 *
 * Both providers expose the same `generate(prompt, opts)` returning a
 * trimmed string. The matching engine doesn't care which one ran.
 */

import Anthropic from "@anthropic-ai/sdk"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"
import { modelForTask, dashscopeModelChain, type TaskTag } from "./model-router"
import { recordAiCall, type AiResolution } from "./usage"
import { generateText, tool, jsonSchema, type ModelMessage } from "ai"
import { applyRoleSkill } from "./skills-loader"
import {
  readRouterConfig, readRouterConfigSync, isTaskEnabled, invalidateRouterConfig,
  type AiRouterConfig,
  type SurfaceName,
} from "./runtime-config"

export type AiProvider = "anthropic" | "ollama" | "gemini" | "openai" | "mistral" | "qwen" | "none"

export interface GenerateOpts {
  maxTokens?: number
  temperature?: number
  /** Explicit model override.  If omitted but `task` is supplied, the
   *  multi-model router picks a model for that task tier. */
  model?: string
  /** Task tag — drives the multi-model router (fast / balanced / deep).
   *  See lib/ai/model-router.ts.  Optional; legacy callers without
   *  `task` continue to use the single OLLAMA_MODEL env. */
  task?: TaskTag
  /** Force structured JSON output (Ollama: format='json'; Anthropic: not supported, prompt-only). */
  json?: boolean
  /** Max retries on transient (429/5xx) errors. Default DEFAULT_RETRIES (2).
   *  Pass 0 to fail fast (the admin self-test does this). */
  retries?: number
  /** Disable cross-provider failover for this call (force the resolved
   *  provider only). Default false — "Auto" mode chains Gemini→Claude→local. */
  noFailover?: boolean
  /** Per-call provider override.  When set to a configured provider this
   *  call uses a single-element chain (no failover), letting the UI pick
   *  Claude / Gemini / OpenAI / Mistral / local for one run without
   *  changing the global Settings. */
  provider?: AiProvider
  /** Which of doc 29 §5's rules chose the model, for telemetry only — it
   *  changes no behaviour (doc 30 §1.2).
   *
   *  Only a caller can say `request`: an honoured user pick and an internal
   *  caller pinning a provider both arrive as `provider`/`model` above, so
   *  inferring this here would report a pipeline's own choice as a user's. Left
   *  unset, provider.ts records the two cases it genuinely owns — `global` for
   *  the admin providerOverride, `auto` for the automatic chain. */
  resolution?: AiResolution
  /** The id the user asked for, when `resolution` is `request`. Recorded beside
   *  the model that answered so a refusal rate has a denominator. */
  requestedModel?: string
  /** What is asking (doc 29 §5, doc 31). When the surface pins a provider or a
   *  task in `ai_router_v1`, that applies here — which is what lets a surface be
   *  pointed somewhere new by config instead of by deploy. A surface nobody
   *  configured resolves exactly as it did before. */
  surface?: SurfaceName
  /** Per-call opt-out of the task's role skill (skills/models/<task>.md).
   *  Default: apply when the task has a skill. Global kill-switch:
   *  ANKER_MODEL_SKILLS=off. See lib/ai/skills-loader.ts. */
  skill?: boolean
}

let _resolved: AiProvider | null = null
/** When _resolved was computed. Memoising it forever meant a warm instance
 *  never noticed a provider change saved in Settings; expire with the same
 *  cadence as the runtime-config cache. */
let _resolvedAt = 0
const RESOLVED_TTL_MS = 5_000
let _anthropic: Anthropic | null = null
let _anthropicKey: string | null = null

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434"
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_MODEL || "gemma2:2b"
const ANTHROPIC_DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001"
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models"
const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"
// OpenAI + Mistral share the OpenAI-style /chat/completions contract.
const OPENAI_API = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1"
const OPENAI_DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini"
const MISTRAL_API = process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1"
const MISTRAL_DEFAULT_MODEL = process.env.MISTRAL_MODEL || "mistral-small-latest"
// Alibaba Cloud Qwen (DashScope) — OpenAI-compatible endpoint.
// Uses the standard DashScope API endpoint by default.
const QWEN_DEFAULT_MODEL = process.env.QWEN_MODEL || "qwen-turbo"
const QWEN_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
function qwenBaseUrl(workspaceId: string | null): string {
  const explicit = process.env.QWEN_BASE_URL
  if (explicit) return explicit.replace(/\/$/, "")
  // If workspace is set, use the per-workspace MaaS endpoint; otherwise use standard DashScope
  if (workspaceId && workspaceId !== "intl") {
    return `https://${workspaceId}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1`
  }
  return QWEN_DEFAULT_BASE_URL
}

// ─── key / mode resolution (runtime config wins over env) ────────────────
function geminiKeyOf(cfg: AiRouterConfig | null): string | null {
  return cfg?.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null
}
function anthropicKeyOf(cfg: AiRouterConfig | null): string | null {
  const k = cfg?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || null
  return k && k !== "stub" ? k : null
}
function openaiKeyOf(cfg: AiRouterConfig | null): string | null {
  return cfg?.openaiApiKey || process.env.OPENAI_API_KEY || null
}
function mistralKeyOf(cfg: AiRouterConfig | null): string | null {
  return cfg?.mistralApiKey || process.env.MISTRAL_API_KEY || null
}
function qwenKeyOf(cfg: AiRouterConfig | null): string | null {
  return cfg?.qwenApiKey || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || null
}
function qwenWorkspaceOf(cfg: AiRouterConfig | null): string | null {
  return cfg?.qwenWorkspaceId || process.env.QWEN_WORKSPACE_ID || null
}
/** Local Ollama is OFF unless explicitly enabled in Data Ops (config.localEnabled)
 *  or via env (AI_PROVIDER=ollama | LOCAL_AI_ENABLED=true). */
function localEnabledOf(cfg: AiRouterConfig | null): boolean {
  return cfg?.localEnabled === true || process.env.AI_PROVIDER === "ollama" || process.env.LOCAL_AI_ENABLED === "true"
}
function geminiModelOf(cfg: AiRouterConfig | null, override?: string): string {
  return override || cfg?.geminiModel || GEMINI_DEFAULT_MODEL
}
function anthropicModelOf(cfg: AiRouterConfig | null, override?: string): string {
  return override || cfg?.anthropicModel || ANTHROPIC_DEFAULT_MODEL
}
function openaiModelOf(cfg: AiRouterConfig | null, override?: string): string {
  return override || cfg?.openaiModel || OPENAI_DEFAULT_MODEL
}
function mistralModelOf(cfg: AiRouterConfig | null, override?: string): string {
  return override || cfg?.mistralModel || MISTRAL_DEFAULT_MODEL
}
function qwenModelOf(cfg: AiRouterConfig | null, override?: string): string {
  return override || cfg?.qwenModel || QWEN_DEFAULT_MODEL
}
/**
 * The config that drives provider selection.
 *
 * Always prefers the awaited DB read — it is itself TTL-cached, so this is
 * cheap — and only falls back to the sync cache if that read throws. The
 * previous order (sync first) meant a warm serverless instance holding a
 * stale/empty cache would ignore the provider + keys saved in Settings →
 * API Keys and silently fall through to whatever provider env vars existed.
 */
async function activeConfig(): Promise<AiRouterConfig | null> {
  return (await readRouterConfig().catch(() => null)) ?? readRouterConfigSync()
}

/** Resolve the active provider.  Order:
 *   1. Runtime admin override (system_settings.ai_router_v1.providerOverride)
 *   2. AI_PROVIDER env
 *   3. ANTHROPIC_API_KEY auto-detect
 *   4. Ollama probe (live fetch against OLLAMA_URL)
 *   5. "none"
 *
 * Caches the result per-process; call `resetProvider()` to force a
 * fresh probe (the system-health endpoint and the reconnect button
 * do this).
 */
/**
 * The provider for one surface, when that surface pins one (doc 31 §1.1).
 *
 * Deliberately NOT a `surface` argument on resolveProvider(): that function
 * memoises into a module-global keyed on nothing, consulted before every other
 * rule, with a 5-second TTL. Threading a surface through it would let whichever
 * surface asked first inside a window decide the provider for all the others —
 * intermittently, under load, and never in a test that calls it once.
 *
 * A surface with no pin falls through to the global resolution, cache and all,
 * so nothing about today's behaviour changes for a surface nobody configured.
 */
export async function resolveProviderForSurface(
  surface: SurfaceName | undefined,
  cfg?: AiRouterConfig | null,
): Promise<AiProvider> {
  const config = cfg !== undefined ? cfg : await activeConfig()
  const pin = surface ? config?.surfaces?.[surface]?.provider : null
  if (pin && pin !== "none") return pin as AiProvider
  return resolveProvider()
}

export async function resolveProvider(): Promise<AiProvider> {
  if (_resolved && Date.now() - _resolvedAt < RESOLVED_TTL_MS) return _resolved
  _resolvedAt = Date.now()

  // 1. Runtime admin override — wins (lets Settings force a provider).
  //    Prefer the awaited DB read (TTL-cached) over a possibly-stale sync cache.
  const config: AiRouterConfig | null =
    (await readRouterConfig().catch(() => null)) ?? readRouterConfigSync()
  if (config?.providerOverride) {
    _resolved = config.providerOverride
    return _resolved
  }

  // 2. Explicit env override.
  const explicit = process.env.AI_PROVIDER as AiProvider | undefined
  if (explicit && ["anthropic", "ollama", "gemini", "openai", "mistral", "qwen", "none"].includes(explicit)) {
    _resolved = explicit
    return _resolved
  }

  // 3. Cloud keys, in failover order: Claude → Gemini → OpenAI → Mistral.
  //    (The same order as providerChain(); this is just the primary for
  //    status displays + batch concurrency — generateDetailed() walks the
  //    full chain and fails over on 429/5xx.)
  // Order MUST match providerChain() or status displays disagree with what
  // actually runs (this is how qwen appeared "active" while Mistral was set).
  if (anthropicKeyOf(config)) { _resolved = "anthropic"; return _resolved }
  if (geminiKeyOf(config)) { _resolved = "gemini"; return _resolved }
  if (openaiKeyOf(config)) { _resolved = "openai"; return _resolved }
  if (mistralKeyOf(config)) { _resolved = "mistral"; return _resolved }
  if (qwenKeyOf(config)) { _resolved = "qwen"; return _resolved }

  // 4. Local Ollama — ONLY when explicitly enabled in Data Ops.
  if (localEnabledOf(config)) {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/version`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) { _resolved = "ollama"; return _resolved }
    } catch { /* daemon not running */ }
  }

  // 5. Nothing configured — callers fall back to deterministic output.
  _resolved = "none"
  return _resolved
}

/** Reset cached probe — called after a settings save so the new provider /
 *  keys take effect immediately instead of waiting for the TTL. Also drops
 *  the runtime-config cache, which is the thing that actually pins keys. */
export function resetProvider(): void {
  invalidateRouterConfig()
  _resolved = null
  _resolvedAt = 0
  _anthropic = null
  _anthropicKey = null
}

export async function isAvailable(): Promise<boolean> {
  return (await resolveProvider()) !== "none"
}

/** Structured result from generateDetailed() — lets callers (and the
 *  admin self-test) see WHY a call produced no text instead of guessing. */
export interface GenerateResult {
  /** The trimmed completion, or "" on any failure. */
  text: string
  /** Human-readable failure reason, or null on success. */
  error: string | null
  /** Provider that handled (or would have handled) the request. */
  provider: AiProvider
  /** Model used, when known. */
  model: string | null
  /** HTTP status from the upstream API, when applicable. */
  status?: number
  /** Provider-reported stop reason (Gemini finishReason / Anthropic stop_reason). */
  finishReason?: string | null
  /**
   * Tokens the provider reported for this call (doc 33).
   *
   * Absent means the provider said nothing, which is NOT zero — `ai_calls` has
   * carried these two columns since 2026-09-21 and every one of its 2531 rows
   * had them null, because nothing ever parsed a `usage` block. A run that
   * cannot be priced falls back to the call cap and is labelled, rather than
   * being recorded as having cost nothing.
   */
  usage?: { promptTokens?: number; outputTokens?: number }
}

/** Positive integers only; anything else is "not reported". */
const tok = (n: unknown): number | undefined =>
  typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined

/** OpenAI-compatible usage: qwen, openai, mistral all speak this shape. */
function openAiUsage(data: any): GenerateResult["usage"] {
  const u = data?.usage
  if (!u) return undefined
  const promptTokens = tok(u.prompt_tokens)
  const outputTokens = tok(u.completion_tokens)
  return promptTokens === undefined && outputTokens === undefined
    ? undefined
    : { promptTokens, outputTokens }
}

/**
 * Generate one short completion. Returns "" on failure (callers should
 * fall back to rule-based output).  Thin wrapper over generateDetailed().
 */
export async function generate(prompt: string, opts: GenerateOpts = {}): Promise<string> {
  return (await generateDetailed(prompt, opts)).text
}

/**
 * Which of doc 29 §5's rules chose the model, for the telemetry record only.
 *
 * The caller's own claim is authoritative and is never second-guessed: `request`
 * can only be known one level up, because an honoured user pick and an internal
 * caller pinning a provider are the same two options from here (doc 30 §1.2).
 * What this function can tell apart is the admin's global override from the
 * automatic chain, so that is all it decides.
 *
 * An undeclared pin records `pinned`, not null. It is a real, knowable thing —
 * a call site chose a provider in code — and giving it a value keeps null
 * meaning only "written before doc 30", so the coverage figure does not count
 * undeclared call sites as missing data.
 *
 * `surface` sits between a code-level pin and the global override, matching doc
 * 29 §5's order: a caller's explicit pin is more specific than a surface's
 * config, which is more specific than the global break-glass.
 */
export function resolveProvenance(opts: GenerateOpts, cfg: AiRouterConfig | null): AiResolution {
  if (opts.resolution) return opts.resolution
  if (opts.provider && opts.provider !== "none") return "pinned"
  const entry = opts.surface ? cfg?.surfaces?.[opts.surface] : undefined
  if (entry?.provider || entry?.task) return "surface"
  return cfg?.providerOverride ? "global" : "auto"
}

/**
 * Like generate(), but returns a structured result that surfaces the
 * real failure reason (HTTP status, API error message, finishReason,
 * safety block, etc).  Used by the Settings → API Keys self-test so a
 * failing probe shows *why* — not just "empty response".
 */
export async function generateDetailed(prompt: string, opts: GenerateOpts = {}): Promise<GenerateResult> {
  checkAiBudget(true)
  // Per-task admin kill-switch.  When the admin has flipped this task
  // off in the portal's AI config the call returns "" immediately
  // so callers fall back to their deterministic / heuristic path.
  if (opts.task) {
    const cfgT = readRouterConfigSync() ?? await readRouterConfig().catch(() => null)
    if (!isTaskEnabled(cfgT, opts.task)) {
      // Recorded under a provider of its own so it is separable from a real
      // failure. A switch that is off and a task nobody uses look identical in
      // a usage table otherwise — both are simply absent — and an admin
      // cannot tell whether turning something off cost anything.
      const blocked = currentAiContext()?.principal
      void recordAiCall({
        task: opts.task, provider: "disabled", ok: false, error: "task disabled by admin",
        workspaceId: blocked?.orgId ?? null, actorId: blocked?.userId ?? null, persona: blocked?.persona ?? null,
      })
      return { text: "", error: `task '${opts.task}' disabled by admin`, provider: "none", model: null }
    }
  }

  // Role skill: prepend the task's role file (skills/models/<task>.md) and fill
  // temperature/maxTokens/json/model as defaults. No-op when the task has no skill,
  // the call passes skill:false, or ANKER_MODEL_SKILLS=off. Caller params still win.
  {
    const applied = applyRoleSkill(prompt, opts)
    prompt = applied.prompt
    opts = applied.opts
  }

  const cfg = await activeConfig()
  const max = opts.maxTokens ?? 80
  const temp = opts.temperature ?? 0.4

  // The surface's own routing, when it has any (doc 31). Its task replaces the
  // caller's, so pointing a surface at a different tier moves every call from it
  // without touching a call site. A surface absent from config contributes
  // nothing and the three lines below behave exactly as they did.
  const surfaceEntry = opts.surface ? cfg?.surfaces?.[opts.surface] : undefined
  if (surfaceEntry?.task) opts = { ...opts, task: surfaceEntry.task as TaskTag }

  // Provider chain. Forced selection (admin override / AI_PROVIDER env) is a
  // single-element chain (no failover). "Auto" yields Gemini → Claude → local,
  // so a 429/5xx on one provider falls over to the next that has a key.
  // A surface pin goes through the same pin logic, so it keeps failover and
  // honours providerStrict rather than quietly losing both (doc 31 §1.5).
  let chain = surfaceProviderChain(cfg, (surfaceEntry?.provider ?? null) as AiProvider | null)
  if (opts.noFailover && chain.length > 1) chain = [chain[0]]
  if (opts.provider && opts.provider !== "none") chain = [opts.provider]

  // A pinned provider (Settings → API Keys) with no saved key would otherwise
  // fail with a vague "no text". Say exactly what's wrong and where to fix it.
  if (cfg?.providerOverride && chain.length === 1 && chain[0] === cfg.providerOverride
      && !hasCredential(chain[0], cfg)) {
    return {
      text: "",
      error: `${PROVIDER_LABEL[chain[0]] ?? chain[0]} is selected in Settings → API Keys but no ${PROVIDER_LABEL[chain[0]] ?? chain[0]} key is saved. Add the key, or switch the provider to Auto.`,
      provider: chain[0], model: null,
    }
  }

  // Provenance for the record (doc 30). The caller's claim wins, because only it
  // can distinguish a user's pick from its own pinning; absent one, the two cases
  // this function owns are the global break-glass and the automatic chain.
  const resolution = resolveProvenance(opts, cfg)

  let last: GenerateResult | null = null
  const attempts: string[] = []
  for (const [attempt, p] of chain.entries()) {
    const startedAt = Date.now()
    last = await runProvider(p, prompt, opts, cfg, max, temp)
    // One row per ATTEMPT, not per call. A platform quietly running on its
    // third-choice provider looks healthy from the outside; `attempt > 0` is
    // what makes failover visible at all. Fire-and-forget: telemetry must not
    // add a database round trip to an AI call, and must never throw.
    // Attribution comes from the ambient principal, which provider.ts already
    // has in scope for the budget check. Absent outside a wrapped request —
    // a background match run has no actor, and the columns stay null rather
    // than carrying something invented.
    const who = currentAiContext()?.principal
    void recordAiCall({
      task: opts.task ?? null,
      provider: p,
      model: last.model,
      attempt,
      ok: Boolean(last.text),
      error: last.text ? null : (last.error ?? "no text"),
      httpStatus: last.status ?? null,
      durationMs: Date.now() - startedAt,
      workspaceId: who?.orgId ?? null,
      actorId: who?.userId ?? null,
      persona: who?.persona ?? null,
      resolution,
      requestedModel: opts.requestedModel ?? null,
      // Doc 33 C1: these two columns have existed since 2026-09-21 and were null
      // on all 2531 rows, because nothing parsed a usage block. They are the
      // input to every cost figure downstream.
      promptTokens: last.usage?.promptTokens ?? null,
      outputTokens: last.usage?.outputTokens ?? null,
    })
    // Charge the run for what this call actually used, before deciding whether to
    // continue. Failed and empty calls count: they consumed the prompt, and a
    // ceiling that ignored them would let a retry loop run free.
    chargeAiBudget(costOf(last.model, last.usage))
    if (last.text) return last       // success (possibly after failover)
    attempts.push(`${p}: ${last.error ?? "no text"}`)
    // fall over to the next provider in the chain
  }
  const error = attempts.length > 1
    ? `all providers failed — ${attempts.join(" | ")}`
    : (last?.error ?? "no AI provider active")
  return {
    text: "", error: error.slice(0, 400),
    provider: last?.provider ?? "none", model: last?.model ?? null,
    status: last?.status, finishReason: last?.finishReason,
    // Carried on the failure path too. The budget was already charged inside the
    // loop, so the ceiling was never wrong — but a caller reading `usage` off a
    // failed result would have seen "no tokens" for a call that really did burn
    // a prompt, which is the same lie in a different place.
    usage: last?.usage,
  }
}

// ─── retry / rate-limit / failover plumbing ──────────────────────────────
const DEFAULT_RETRIES = 2
const RETRYABLE = new Set([429, 500, 502, 503, 504])
const RETRY_BASE_MS = 600
const MAX_RETRY_WAIT_MS = 15_000          // don't sit on a daily-quota delay
const AI_MAX_RPM = Number(process.env.AI_MAX_RPM ?? 0)   // 0 = limiter disabled

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const withJitter = (ms: number) => ms + Math.floor(Math.random() * 250)

/** Minimum-interval rate gate. When AI_MAX_RPM>0, spaces upstream calls to at
 *  most that many starts per minute — smooths bursts (matchmaking/embeddings/
 *  enrichment) so they stay under the provider's per-minute (RPM) ceiling. */
let _rateChain: Promise<void> = Promise.resolve()
let _lastStart = 0
async function rateGate(): Promise<void> {
  if (!AI_MAX_RPM || AI_MAX_RPM <= 0) return
  const minGap = 60_000 / AI_MAX_RPM
  _rateChain = _rateChain.then(async () => {
    const wait = Math.max(0, _lastStart + minGap - Date.now())
    if (wait) await sleep(wait)
    _lastStart = Date.now()
  })
  return _rateChain
}

/** Wait (ms) from a Retry-After header or Gemini's RetryInfo.retryDelay. */
function parseRetryMs(res: Response | null, bodyText: string): number | null {
  const ra = res?.headers?.get?.("retry-after")
  if (ra) {
    const secs = Number(ra)
    if (Number.isFinite(secs)) return secs * 1000
    const when = Date.parse(ra)
    if (Number.isFinite(when)) return Math.max(0, when - Date.now())
  }
  const m = bodyText.match(/"retryDelay"\s*:\s*"([0-9.]+)s"/)   // e.g. "12s" / "1.5s"
  if (m) return Math.round(parseFloat(m[1]) * 1000)
  return null
}

/** Ordered provider chain (failover order) derived from config. Exported so
 *  status displays / tests can show the active order.
 *
 *  Auto order: Claude → Gemini → OpenAI → Mistral → local (each included
 *  only if its key is set / local is enabled). When every configured
 *  provider is exhausted the caller surfaces the error so you can wait for
 *  the free-tier daily reset. A providerOverride / AI_PROVIDER env pins a
 *  single provider (no failover). */
/** True when the provider has a usable credential (or needs none).
 *  Mirrors providerChain(): once keys are saved in Settings, only saved keys
 *  count — an env key alone must not make a provider look configured. */
export function hasCredential(p: AiProvider, cfg: AiRouterConfig | null): boolean {
  const saved = hasSavedKeys(cfg)
  const ok = (dbKey: string | null | undefined, envKey: string | null) =>
    saved ? !!dbKey : !!(dbKey || envKey)
  switch (p) {
    case "anthropic": return ok(cfg?.anthropicApiKey, anthropicKeyOf(null))
    case "gemini": return ok(cfg?.geminiApiKey, geminiKeyOf(null))
    case "openai": return ok(cfg?.openaiApiKey, openaiKeyOf(null))
    case "mistral": return ok(cfg?.mistralApiKey, mistralKeyOf(null))
    case "qwen": return ok(cfg?.qwenApiKey, qwenKeyOf(null))
    case "ollama": return localEnabledOf(cfg)
    default: return false
  }
}

/** True once the admin has saved at least one provider key in Settings.
 *  From that point the saved config is authoritative for *which providers
 *  exist*, and stray env keys can no longer inject a provider into the
 *  chain — that is how a leftover DASHSCOPE_API_KEY silently took over. */
function hasSavedKeys(cfg: AiRouterConfig | null): boolean {
  return !!(cfg?.anthropicApiKey || cfg?.geminiApiKey || cfg?.openaiApiKey
    || cfg?.mistralApiKey || cfg?.qwenApiKey)
}

/**
 * The chain for one surface (doc 31 §1.5).
 *
 * A surface's provider is fed through the SAME pin logic a global
 * providerOverride uses rather than applied on top of the finished chain: done
 * the other way it would silently drop failover, or silently ignore the
 * `providerStrict` an admin set for cost or compliance. A surface that pins
 * nothing gets exactly `providerChain(cfg)`.
 */
export function surfaceProviderChain(
  cfg: AiRouterConfig | null,
  pin: AiProvider | null,
): AiProvider[] {
  if (!pin || pin === "none") return providerChain(cfg)
  return providerChain({ ...(cfg ?? ({} as AiRouterConfig)), providerOverride: pin })
}

export function providerChain(cfg: AiRouterConfig | null): AiProvider[] {
  const env = process.env.AI_PROVIDER as AiProvider | undefined
  const envPinned = env && ["anthropic", "ollama", "gemini", "openai", "mistral", "qwen", "none"].includes(env)
    ? env : null

  // Once keys are saved in Settings, membership comes from the config alone.
  // Before that (bootstrap / self-hosted) we still honour env keys.
  const saved = hasSavedKeys(cfg)
  const keyed = (dbKey: string | null | undefined, envKey: string | null): boolean =>
    saved ? !!dbKey : !!(dbKey || envKey)

  const auto: AiProvider[] = []
  if (keyed(cfg?.anthropicApiKey, anthropicKeyOf(null))) auto.push("anthropic")
  if (keyed(cfg?.geminiApiKey, geminiKeyOf(null))) auto.push("gemini")
  if (keyed(cfg?.openaiApiKey, openaiKeyOf(null))) auto.push("openai")
  if (keyed(cfg?.mistralApiKey, mistralKeyOf(null))) auto.push("mistral")
  if (keyed(cfg?.qwenApiKey, qwenKeyOf(null))) auto.push("qwen")
  if (localEnabledOf(cfg)) auto.push("ollama")

  const pinned = cfg?.providerOverride ?? envPinned
  if (pinned && pinned !== "none") {
    // Strict: honour the pin exactly, no failover (cost/compliance control).
    // Returned even when it has no key so the caller can say exactly that.
    if (cfg?.providerStrict) return [pinned]
    // Default: the pinned provider leads, everything else configured backs it
    // up — so a quota/outage on the preferred provider doesn't kill the request.
    const rest = auto.filter((p) => p !== pinned)
    // A pin with no usable key would just burn the first attempt; skip it when
    // there are real backups, but keep it as the sole entry if there are none
    // (that path produces the "no key saved" error rather than a vague miss).
    if (!hasCredential(pinned, cfg)) return rest.length ? rest : [pinned]
    return [pinned, ...rest]
  }
  if (pinned === "none") return ["none"]

  return auto.length ? auto : ["none"]
}

async function runProvider(
  p: AiProvider, prompt: string, opts: GenerateOpts,
  cfg: AiRouterConfig | null, max: number, temp: number,
): Promise<GenerateResult> {
  if (p === "anthropic") return runAnthropic(prompt, opts, cfg, max, temp)
  if (p === "gemini") return runGemini(prompt, opts, cfg, max, temp)
  if (p === "openai") return runOpenAICompatible("openai", OPENAI_API, openaiKeyOf(cfg), openaiModelOf(cfg, opts.model), prompt, opts, max, temp)
  if (p === "mistral") return runOpenAICompatible("mistral", MISTRAL_API, mistralKeyOf(cfg), mistralModelOf(cfg, opts.model), prompt, opts, max, temp)
  if (p === "qwen") {
    // Tier-based cloud routing WITH model-level failover: try the task's chain
    // (primary + 3 backups from earlier family generations) in order; move to the next
    // backup on a model/availability error. An explicit opts.model is a 1-model chain.
    const base = qwenBaseUrl(qwenWorkspaceOf(cfg))
    const key = qwenKeyOf(cfg)
    const chain = opts.model ? [opts.model]
      : opts.task ? dashscopeModelChain(opts.task)
      : [qwenModelOf(cfg)]
    let last: GenerateResult = { text: "", error: "no qwen model resolved", provider: "qwen", model: null }
    for (const m of chain) {
      const res = await runOpenAICompatible("qwen", base, key, m, prompt, opts, max, temp)
      if (res.text) return res
      last = res
      // A missing/invalid key fails identically for every model — stop and let the outer
      // provider chain take over rather than retry the same auth error across the chain.
      if (res.error && /api key|unauthoriz|\b401\b|forbidden|\b403\b/i.test(res.error)) break
    }
    return last
  }
  if (p === "ollama") return runOllama(prompt, opts, max, temp)
  return { text: "", error: "no AI provider active (set a Claude/Gemini/OpenAI/Mistral key, or enable local models)", provider: "none", model: null }
}

/** OpenAI + Mistral both speak the OpenAI /chat/completions contract, so one
 *  implementation covers both. Includes 429/5xx backoff + the global rateGate. */
async function runOpenAICompatible(
  provider: AiProvider, base: string, key: string | null, model: string,
  prompt: string, opts: GenerateOpts, max: number, temp: number,
): Promise<GenerateResult> {
  const label = provider === "openai" ? "OpenAI" : "Mistral"
  if (!key) return { text: "", error: `no ${label} API key configured`, provider, model: null }
  const retries = opts.retries ?? DEFAULT_RETRIES
  let lastErr = "error"
  let lastStatus: number | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    await rateGate()
    let res: Response
    try {
      res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: max,
          temperature: temp,
          ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: currentAiContext()?.signal ? AbortSignal.any([currentAiContext()!.signal!, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      })
    } catch (e) {
      lastErr = (e as Error).name === "TimeoutError" ? "request timed out (120s)" : (e as Error).message
      if (attempt < retries) { await sleep(withJitter(RETRY_BASE_MS * 2 ** attempt)); continue }
      return { text: "", error: lastErr, provider, model }
    }
    if (!res.ok) {
      const raw = (await res.text().catch(() => "")).slice(0, 500)
      let detail = raw
      try { detail = (JSON.parse(raw) as any)?.error?.message || raw } catch { /* not JSON */ }
      lastErr = `HTTP ${res.status}: ${detail}`.slice(0, 300)
      lastStatus = res.status
      if (RETRYABLE.has(res.status) && attempt < retries) {
        const wait = parseRetryMs(res, raw) ?? RETRY_BASE_MS * 2 ** attempt
        if (wait <= MAX_RETRY_WAIT_MS) {
          console.warn(`[ai/${provider}] ${res.status}; retry in ${wait}ms (attempt ${attempt + 1}/${retries})`)
          await sleep(withJitter(wait)); continue
        }
      }
      console.error(`[ai/${provider}] non-200:`, res.status, detail.slice(0, 160))
      return { text: "", error: lastErr, status: lastStatus, provider, model }
    }
    const data = (await res.json().catch(() => ({}))) as any
    const choice = data?.choices?.[0]
    const text = (choice?.message?.content ?? "").trim()
    const finishReason: string | null = choice?.finish_reason ?? null
    const usage = openAiUsage(data)
    // Carried on the failure return too: an empty completion still consumed the
    // prompt, and a ceiling that ignored failed calls would let a retry loop of
    // them run free.
    if (!text) return { text: "", error: `empty response (finish_reason=${finishReason ?? "?"})`, finishReason, provider, model, usage }
    return { text, error: null, finishReason, provider, model, usage }
  }
  return { text: "", error: lastErr, status: lastStatus, provider, model }
}

async function runGemini(
  prompt: string, opts: GenerateOpts, cfg: AiRouterConfig | null, max: number, temp: number,
): Promise<GenerateResult> {
  const provider: AiProvider = "gemini"
  const key = geminiKeyOf(cfg)
  if (!key) return { text: "", error: "no Gemini API key configured", provider, model: null }
  const model = geminiModelOf(cfg, opts.model)
  // Flash-thinking models (2.5-flash) can spend the entire output budget on
  // internal reasoning and return zero visible text + finishReason=MAX_TOKENS.
  // Give a sane floor so even a tiny maxTokens still yields output.
  const maxOut = Math.max(max, 512)
  const retries = opts.retries ?? DEFAULT_RETRIES
  let lastErr = "error"
  let lastStatus: number | undefined
  for (let attempt = 0; attempt <= retries; attempt++) {
    await rateGate()
    let res: Response
    try {
      res = await fetch(`${GEMINI_API}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: maxOut, temperature: temp,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
        signal: currentAiContext()?.signal ? AbortSignal.any([currentAiContext()!.signal!, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
      })
    } catch (e) {
      lastErr = (e as Error).name === "TimeoutError" ? "request timed out (120s)" : (e as Error).message
      if (attempt < retries) { await sleep(withJitter(RETRY_BASE_MS * 2 ** attempt)); continue }
      return { text: "", error: lastErr, provider, model }
    }
    if (!res.ok) {
      const raw = (await res.text().catch(() => "")).slice(0, 500)
      let detail = raw
      try { detail = (JSON.parse(raw) as any)?.error?.message || raw } catch { /* not JSON */ }
      lastErr = `HTTP ${res.status}: ${detail}`.slice(0, 300)
      lastStatus = res.status
      if (RETRYABLE.has(res.status) && attempt < retries) {
        const wait = parseRetryMs(res, raw) ?? RETRY_BASE_MS * 2 ** attempt
        if (wait <= MAX_RETRY_WAIT_MS) {
          console.warn(`[ai/gemini] ${res.status}; retry in ${wait}ms (attempt ${attempt + 1}/${retries})`)
          await sleep(withJitter(wait)); continue
        }
        // delay signals a long/daily cap — don't sit on it; let caller fail over
      }
      console.error("[ai/gemini] non-200:", res.status, detail.slice(0, 160))
      return { text: "", error: lastErr, status: lastStatus, provider, model }
    }
    const data = (await res.json().catch(() => ({}))) as any
    const cand = data?.candidates?.[0]
    const parts = cand?.content?.parts
    const text = Array.isArray(parts) ? parts.map((x: any) => x?.text ?? "").join("") : ""
    const finishReason: string | null = cand?.finishReason ?? null
    // Gemini reports usage under its own names, on usageMetadata.
    const um = data?.usageMetadata
    const usage = um
      ? { promptTokens: tok(um.promptTokenCount), outputTokens: tok(um.candidatesTokenCount) }
      : undefined
    if (!text.trim()) {
      const block = data?.promptFeedback?.blockReason
      const error = block
        ? `blocked by safety filter: ${block}`
        : finishReason
          ? `empty response (finishReason=${finishReason}${finishReason === "MAX_TOKENS" ? " — raise maxOutputTokens" : ""})`
          : "empty response (no candidates returned)"
      return { text: "", error, finishReason, provider, model, usage }
    }
    return { text: text.trim(), error: null, finishReason, provider, model, usage }
  }
  return { text: "", error: lastErr, status: lastStatus, provider, model }
}

async function runAnthropic(
  prompt: string, opts: GenerateOpts, cfg: AiRouterConfig | null, max: number, temp: number,
): Promise<GenerateResult> {
  const provider: AiProvider = "anthropic"
  const key = anthropicKeyOf(cfg)
  if (!key) return { text: "", error: "no Anthropic API key configured", provider, model: null }
  const model = anthropicModelOf(cfg, opts.model)
  // The Anthropic SDK retries 429/5xx internally with Retry-After-aware backoff.
  const maxRetries = opts.retries ?? DEFAULT_RETRIES
  if (!_anthropic || _anthropicKey !== key) { _anthropic = new Anthropic({ apiKey: key, maxRetries }); _anthropicKey = key }
  try {
    await rateGate()
    const resp = await _anthropic.messages.create({
      model, max_tokens: max, temperature: temp,
      messages: [{ role: "user", content: prompt }],
    })
    const block = resp.content[0]
    const text = block?.type === "text" ? block.text.trim() : ""
    // Anthropic reports input_tokens / output_tokens on the message itself.
    const usage = resp.usage
      ? { promptTokens: tok(resp.usage.input_tokens), outputTokens: tok(resp.usage.output_tokens) }
      : undefined
    if (!text) return { text: "", error: `empty response (stop_reason=${resp.stop_reason ?? "?"})`, finishReason: resp.stop_reason ?? null, provider, model, usage }
    return { text, error: null, finishReason: resp.stop_reason ?? null, provider, model, usage }
  } catch (e: any) {
    const error = e?.status ? `HTTP ${e.status}: ${e?.error?.error?.message || e?.message || "error"}` : (e?.message ?? "error")
    console.error("[ai/anthropic] error:", error)
    return { text: "", error: String(error).slice(0, 300), status: e?.status, provider, model }
  }
}

async function runOllama(
  prompt: string, opts: GenerateOpts, max: number, temp: number,
): Promise<GenerateResult> {
  const provider: AiProvider = "ollama"
  // Pick the right local model for this task, tolerating un-pulled tiers.
  const requested = opts.model ?? (opts.task ? modelForTask(opts.task) : OLLAMA_DEFAULT_MODEL)
  const ollamaModel = await pickAvailableOllamaModel(requested)
  if (!ollamaModel) {
    return { text: "", error: "no local models pulled (e.g. `ollama pull gemma2:2b`)", provider, model: null }
  }
  if (ollamaModel !== requested) {
    console.warn(`[ai/ollama] requested '${requested}' not pulled, falling back to '${ollamaModel}'. Pull with: ollama pull ${requested}`)
  }
  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaModel, prompt, stream: false,
        ...(opts.json ? { format: "json" } : {}),
        options: { num_predict: max, temperature: temp },
      }),
      signal: currentAiContext()?.signal ? AbortSignal.any([currentAiContext()!.signal!, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
    })
    if (!res.ok) {
      if (res.status === 404) {
        invalidateModelsCache()
        const retryModel = await pickAvailableOllamaModel(undefined)
        if (retryModel && retryModel !== ollamaModel) {
          console.warn(`[ai/ollama] retry with fallback model '${retryModel}'`)
          const r2 = await fetch(`${OLLAMA_URL}/api/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              model: retryModel, prompt, stream: false,
              ...(opts.json ? { format: "json" } : {}),
              options: { num_predict: max, temperature: temp },
            }),
            signal: currentAiContext()?.signal ? AbortSignal.any([currentAiContext()!.signal!, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
          })
          if (r2.ok) {
            const j2 = (await r2.json()) as { response?: string }
            return { text: (j2.response ?? "").trim(), error: null, provider, model: retryModel }
          }
        }
      }
      console.error("[ai/ollama] non-200:", res.status)
      return { text: "", error: `HTTP ${res.status} from Ollama`, status: res.status, provider, model: ollamaModel }
    }
    const json = (await res.json()) as { response?: string }
    const text = (json.response ?? "").trim()
    if (!text) return { text: "", error: "empty response from Ollama", provider, model: ollamaModel }
    return { text, error: null, provider, model: ollamaModel }
  } catch (e) {
    const error = (e as Error).name === "TimeoutError" ? "request timed out (120s)" : (e as Error).message
    console.error("[ai/ollama] error:", error)
    return { text: "", error, provider, model: ollamaModel }
  }
}

/**
 * Generate completions for many prompts with a small concurrency limit.
 * Anthropic supports parallel; Ollama does too but is single-GPU bound,
 * so we cap at 4 to avoid thrashing.
 */
export async function generateBatch(
  prompts: string[],
  opts: GenerateOpts = {},
  concurrency = 4,
  onProgress?: (done: number) => void,
): Promise<string[]> {
  const out: string[] = new Array(prompts.length).fill("")
  let cursor = 0
  let done = 0
  const provider = await resolveProvider()
  // Concurrency by provider: Anthropic handles ~8 in flight; Gemini's free
  // tier is RPM-limited so keep it low (the global rateGate smooths further
  // when AI_MAX_RPM is set); Ollama is single-GPU bound.
  const limit =
    provider === "anthropic" ? Math.max(concurrency, 8)
    : provider === "gemini" ? Math.min(concurrency, 2)
    : (provider === "openai" || provider === "mistral") ? Math.min(concurrency, 4)
    : concurrency

  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= prompts.length) return
      out[i] = await generate(prompts[i], opts)
      done++
      onProgress?.(done)
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, prompts.length) }, worker))
  return out
}

/** Provider info for status displays. */
export async function providerInfo(): Promise<{
  provider: AiProvider
  model: string | null
  url: string | null
  /** When provider is 'ollama', the active task→model routing.  Null
   *  for anthropic / none. */
  routing: ReturnType<typeof import("./model-router").snapshotModelRouting> | null
}> {
  const p = await resolveProvider()
  const cfg = await activeConfig()
  if (p === "gemini") return { provider: p, model: geminiModelOf(cfg), url: GEMINI_API, routing: null }
  if (p === "anthropic") return { provider: p, model: anthropicModelOf(cfg), url: null, routing: null }
  if (p === "openai") return { provider: p, model: openaiModelOf(cfg), url: OPENAI_API, routing: null }
  if (p === "qwen") return { provider: p, model: qwenModelOf(cfg), url: qwenBaseUrl(qwenWorkspaceOf(cfg)), routing: null }
  if (p === "mistral") return { provider: p, model: mistralModelOf(cfg), url: MISTRAL_API, routing: null }
  if (p === "ollama") {
    const { snapshotModelRouting } = await import("./model-router")
    return { provider: p, model: OLLAMA_DEFAULT_MODEL, url: OLLAMA_URL, routing: snapshotModelRouting() }
  }
  return { provider: "none", model: null, url: null, routing: null }
}

// ─── Ollama-pulled-models cache ─────────────────────────────────────────
// We probe `/api/tags` once and cache for 60s.  Used by the Ollama
// branch above to avoid 404s on un-pulled models.
let _modelsCache: { at: number; names: string[] } | null = null
const MODELS_TTL_MS = 60_000

export function invalidateModelsCache(): void {
  _modelsCache = null
}

export async function listAvailableOllamaModels(): Promise<string[]> {
  if (_modelsCache && Date.now() - _modelsCache.at < MODELS_TTL_MS) {
    return _modelsCache.names
  }
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    })
    if (!res.ok) {
      _modelsCache = { at: Date.now(), names: [] }
      return []
    }
    const json = (await res.json()) as { models?: { name?: string; model?: string }[] }
    const names = (json?.models ?? [])
      .map((m) => (m.name ?? m.model ?? "").trim())
      .filter(Boolean)
    _modelsCache = { at: Date.now(), names }
    return names
  } catch {
    _modelsCache = { at: Date.now(), names: [] }
    return []
  }
}

/**
 * Given a *requested* model id, return the best available one from
 * the local Ollama install:
 *
 *   1. The requested model (or with `:latest` suffix tolerance).
 *   2. The legacy OLLAMA_MODEL env (default gemma2:2b).
 *   3. The first model that's actually pulled.
 *   4. null if nothing's pulled.
 */
export async function pickAvailableOllamaModel(
  requested: string | undefined,
): Promise<string | null> {
  const available = await listAvailableOllamaModels()
  if (available.length === 0) {
    // Probably can't reach the daemon — return the requested name and
    // let the caller report the error.
    return requested ?? OLLAMA_DEFAULT_MODEL ?? null
  }

  function matches(target: string): string | null {
    if (!target) return null
    if (available.includes(target)) return target
    // Tolerate :latest suffix differences ("qwen2.5:7b" vs "qwen2.5:7b-instruct" etc).
    const baseTarget = target.split(":")[0]
    const found = available.find((a) => {
      if (a === target) return true
      if (a === `${target}:latest`) return true
      const baseA = a.split(":")[0]
      return baseA === baseTarget
    })
    return found ?? null
  }

  if (requested) {
    const m = matches(requested)
    if (m) return m
  }
  const legacy = matches(OLLAMA_DEFAULT_MODEL)
  if (legacy) return legacy
  // Prefer chat-instruct models over embedding ones for `generate()`.
  const nonEmbed = available.find((a) => !/embed|nomic-embed/i.test(a))
  return nonEmbed ?? available[0] ?? null
}

// ─── live status snapshot ─────────────────────────────────────────────────
// Used by /api/ai/status + the on-page AiStatusBadge to render the active
// provider + failover chain + model, without leaking secrets.
export const PROVIDER_LABEL: Record<AiProvider, string> = {
  anthropic: "Claude",
  gemini: "Gemini",
  openai: "OpenAI",
  mistral: "Mistral",
  ollama: "Local (Ollama)",
  none: "Heuristic fallback",
  qwen: "Qwen (Alibaba)",
}

export interface AiStatus {
  active: AiProvider
  /** Resolved provider chain in failover order. */
  chain: AiProvider[]
  /** Per-provider friendly labels (chain entries always resolve here). */
  labels: Record<string, string>
  /** Which providers are configured (key present / local enabled). */
  configured: { anthropic: boolean; gemini: boolean; openai: boolean; mistral: boolean; ollama: boolean }
  /** Effective model on the active provider, when known. */
  model: string | null
  /** Admin-level forced provider, if any (locks the chain to one). */
  forcedOverride: AiProvider | null
}

export async function getAiStatus(): Promise<AiStatus> {
  const cfg = await activeConfig()
  const active = await resolveProvider()
  const chain = providerChain(cfg)
  const configured = {
    anthropic: !!anthropicKeyOf(cfg),
    gemini: !!geminiKeyOf(cfg),
    openai: !!openaiKeyOf(cfg),
    mistral: !!mistralKeyOf(cfg),
    ollama: localEnabledOf(cfg),
  }
  const model =
    active === "anthropic" ? anthropicModelOf(cfg)
    : active === "gemini" ? geminiModelOf(cfg)
    : active === "openai" ? openaiModelOf(cfg)
    : active === "mistral" ? mistralModelOf(cfg)
    : null
  return {
    active, chain, labels: PROVIDER_LABEL, configured, model,
    forcedOverride: (cfg?.providerOverride as AiProvider | null) ?? null,
  }
}

// ─── AI SDK Model Instance Helper ─────────────────────────────────────────
// Returns an AI SDK LanguageModel instance based on the runtime-configured 
// provider and API key. Uses @ai-sdk/openai-compatible for custom providers.

export interface AiSdkModelConfig {
  model: LanguageModel     // The actual AI SDK model instance
  provider: AiProvider
  modelName: string        // The model name for display
}

/**
 * Get an AI SDK model instance based on the active runtime configuration.
 * This allows chat routes and other AI SDK consumers to use the saved API keys.
 *
 * `surface` is the argument doc 29 §5 says this has always needed: with it, a
 * surface pointed at a provider in `ai_router_v1` takes effect here without a
 * deploy. Called with no argument — as every caller did before doc 31 — the
 * resolution is bit-for-bit what it was.
 *
 * Note what this does NOT do: it never reads a provider or model from a request.
 * `/api/chat` has no such input today (doc 31 §1.4), and keeping the surface the
 * only source is what makes "this provider is exclusive to the chatbot" a claim
 * the code can actually keep.
 */
export async function getAiSdkModel(
  opts: { surface?: SurfaceName; provider?: AiProvider; model?: string } = {},
): Promise<AiSdkModelConfig> {
  const cfg = await activeConfig()
  // An explicit provider is how generateWithTools walks the failover chain: that
  // attempt has already decided which provider it is for, and must not have the
  // decision second-guessed by the surface or the global resolution.
  const provider = opts.provider && opts.provider !== "none"
    ? opts.provider
    : await resolveProviderForSurface(opts.surface, cfg)

  switch (provider) {
    case "anthropic": {
      const modelName = anthropicModelOf(cfg, opts.model)
      const apiKey = anthropicKeyOf(cfg)
      if (!apiKey) throw new Error("Anthropic API key not configured")
      const anthropicProvider = createOpenAICompatible({
        name: "anthropic",
        baseURL: "https://api.anthropic.com/v1",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      })
      return { model: anthropicProvider.chatModel(modelName), provider, modelName }
    }
    case "gemini": {
      const modelName = geminiModelOf(cfg, opts.model)
      const apiKey = geminiKeyOf(cfg)
      if (!apiKey) throw new Error("Gemini API key not configured")
      const geminiProvider = createOpenAICompatible({
        name: "gemini",
        baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
        headers: { "x-goog-api-key": apiKey },
      })
      return { model: geminiProvider.chatModel(modelName), provider, modelName }
    }
    case "openai": {
      const modelName = openaiModelOf(cfg, opts.model)
      const apiKey = openaiKeyOf(cfg)
      if (!apiKey) throw new Error("OpenAI API key not configured")
      const openaiProvider = createOpenAICompatible({
        name: "openai",
        baseURL: OPENAI_API,
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      return { model: openaiProvider.chatModel(modelName), provider, modelName }
    }
    case "mistral": {
      const modelName = mistralModelOf(cfg, opts.model)
      const apiKey = mistralKeyOf(cfg)
      if (!apiKey) throw new Error("Mistral API key not configured")
      const mistralProvider = createOpenAICompatible({
        name: "mistral",
        baseURL: MISTRAL_API,
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      return { model: mistralProvider.chatModel(modelName), provider, modelName }
    }
    case "qwen": {
      const modelName = qwenModelOf(cfg, opts.model)
      const apiKey = qwenKeyOf(cfg)
      if (!apiKey) throw new Error("Qwen API key not configured")
      const qwenProvider = createOpenAICompatible({
        name: "qwen",
        baseURL: qwenBaseUrl(qwenWorkspaceOf(cfg)),
        headers: { Authorization: `Bearer ${apiKey}` },
      })
      return { model: qwenProvider.chatModel(modelName), provider, modelName }
    }
    case "ollama": {
      const modelName = opts.model ?? OLLAMA_DEFAULT_MODEL
      const ollamaProvider = createOpenAICompatible({
        name: "ollama",
        baseURL: `${OLLAMA_URL}/v1`,
      })
      return { model: ollamaProvider.chatModel(modelName), provider, modelName }
    }
    default:
      throw new Error("No AI provider configured. Please set an API key in Settings > API Keys.")
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// STREAMING  (doc 28 phase 4)
// ═══════════════════════════════════════════════════════════════════════════

/** Which providers can deliver incrementally. Everything else falls back. */
const STREAMABLE: ReadonlySet<AiProvider> = new Set(["openai", "mistral", "qwen"])

/**
 * Can the resolved provider actually stream?
 *
 * Exposed so a route can advertise the truth in its capabilities descriptor
 * (doc 28 §4.2) rather than promising a stream and delivering one chunk. A
 * client that sees `streaming: false` is not broken; it is correctly informed.
 */
export async function canStream(opts: GenerateOpts = {}): Promise<boolean> {
  try {
    // Surface-aware, or the header would promise streaming for the globally
    // resolved provider while generateStream ran on the surface's pinned one.
    const p = opts.provider ?? (await resolveProviderForSurface(opts.surface))
    return STREAMABLE.has(p)
  } catch { return false }
}

// ─── Native tool calling (doc 29 phase 5, doc 34) ───────────────────────────

/** One tool as offered to the model. `inputSchema` is a JSON Schema from
 *  lib/assistant/tool-schemas.ts — the same one the MCP route serves. */
export interface ToolSpec { name: string; description: string; inputSchema: unknown }

/** A call the model decided to make. Executing it is the AGENT's job, not this
 *  layer's — see generateWithTools. */
export interface ToolCallRequest { id: string; name: string; input: unknown }

export type ToolThreadMessage = ModelMessage

/**
 * Generate with native tool calling, over a message thread.
 *
 * Why this exists beside `generateDetailed` rather than replacing it, and why it
 * is not a thin wrapper over the AI SDK (doc 34 §1.1):
 *
 * The platform's two existing AI SDK consumers — /api/chat and
 * /api/documents/analyze — are uninstrumented. They call `streamText` and
 * nothing else, so their calls never reach `ai_calls`, never charge the run's
 * cost ceiling, never count against the call cap and never fail over to another
 * provider. Routing the ASSISTANT down that path, as doc 29 §6's sketch implies,
 * would forfeit doc 30's recording, doc 33's tokens and ceiling, and doc 31's
 * surface routing in a single commit, on the surface that makes up to sixteen
 * model calls per run.
 *
 * So the SDK is driven from INSIDE the same chain `generateDetailed` uses: same
 * provider order, same failover, same `recordAiCall`, same `chargeAiBudget`, same
 * provenance. The SDK's only job is the per-vendor tool-call protocol, which
 * genuinely differs between OpenAI-compatible, Anthropic and Gemini and is not
 * worth reimplementing.
 *
 * **Tools are described, never executed here.** The SDK's `execute` callback
 * would run them inside the provider layer, where the principal, the event log
 * and the artifact list are out of scope — and `tool.requested` has to be logged
 * before the work happens (doc 28 §4.1). The agent keeps calling `executeTool`
 * itself and threads results back as `tool` messages.
 */
export async function generateWithTools(
  messages: ToolThreadMessage[],
  tools: ToolSpec[],
  opts: GenerateOpts = {},
): Promise<GenerateResult & { toolCalls: ToolCallRequest[] }> {
  checkAiBudget(true)
  const cfg = await activeConfig()
  const max = opts.maxTokens ?? 800
  const temp = opts.temperature ?? 0.4

  const surfaceEntry = opts.surface ? cfg?.surfaces?.[opts.surface] : undefined
  if (surfaceEntry?.task) opts = { ...opts, task: surfaceEntry.task as TaskTag }

  let chain = surfaceProviderChain(cfg, (surfaceEntry?.provider ?? null) as AiProvider | null)
  if (opts.noFailover && chain.length > 1) chain = [chain[0]]
  if (opts.provider && opts.provider !== "none") chain = [opts.provider]

  const resolution = resolveProvenance(opts, cfg)
  // Described, not executed: no `execute` key, so the SDK returns the call for
  // the agent to run. dynamicTool takes a runtime schema, which is what we have
  // — these are JSON Schemas, not compile-time Zod types.
  // `tool()` rather than `dynamicTool()`: dynamicTool REQUIRES an `execute`, and
  // handing the SDK an executor is precisely what must not happen here. A tool
  // with no `execute` is a supported variant — the model may call it, the SDK
  // returns the call, and nothing runs until the agent decides to run it.
  const toolSet = Object.fromEntries(tools.map((t) => [t.name, tool({
    description: t.description,
    inputSchema: jsonSchema(t.inputSchema as any),
  })]))

  let lastErr = "no AI provider active"
  let lastStatus: number | undefined
  for (const [attempt, p] of chain.entries()) {
    const startedAt = Date.now()
    let model: string | null = null
    try {
      const sdk = await getAiSdkModel({ surface: opts.surface, provider: p, model: opts.model })
      model = sdk.modelName
      const res = await generateText({
        model: sdk.model, messages, tools: toolSet,
        maxOutputTokens: max, temperature: temp,
        abortSignal: currentAiContext()?.signal,
      })
      const usage = res.usage
        ? { promptTokens: tok(res.usage.inputTokens), outputTokens: tok(res.usage.outputTokens) }
        : undefined
      const toolCalls: ToolCallRequest[] = (res.toolCalls ?? []).map((c: any) => ({
        id: c.toolCallId, name: c.toolName, input: c.input ?? c.args ?? {},
      }))
      const text = (res.text ?? "").trim()
      const who = currentAiContext()?.principal
      void recordAiCall({
        task: opts.task ?? null, provider: p, model, attempt,
        // A turn that only asked for a tool produced no text and is still a
        // success — judging it by `text` would mark every tool step a failure.
        ok: Boolean(text) || toolCalls.length > 0,
        error: text || toolCalls.length ? null : "no text and no tool call",
        durationMs: Date.now() - startedAt,
        workspaceId: who?.orgId ?? null, actorId: who?.userId ?? null, persona: who?.persona ?? null,
        resolution, requestedModel: opts.requestedModel ?? null,
        promptTokens: usage?.promptTokens ?? null, outputTokens: usage?.outputTokens ?? null,
      })
      chargeAiBudget(costOf(model, usage))
      if (text || toolCalls.length) {
        return { text, error: null, provider: p, model, usage, toolCalls,
                 finishReason: res.finishReason ?? null }
      }
      lastErr = "no text and no tool call"
    } catch (e: any) {
      lastErr = String(e?.message ?? e ?? "error").slice(0, 300)
      lastStatus = e?.statusCode ?? e?.status
      const who = currentAiContext()?.principal
      void recordAiCall({
        task: opts.task ?? null, provider: p, model, attempt, ok: false, error: lastErr,
        httpStatus: lastStatus ?? null, durationMs: Date.now() - startedAt,
        workspaceId: who?.orgId ?? null, actorId: who?.userId ?? null, persona: who?.persona ?? null,
        resolution, requestedModel: opts.requestedModel ?? null,
      })
      // Fall through to the next provider, exactly as generateDetailed does.
    }
  }
  return { text: "", error: lastErr, status: lastStatus, provider: chain[chain.length - 1] ?? "none",
           model: null, toolCalls: [] }
}

/**
 * Generate, yielding text as it arrives.
 *
 * Always yields the same total text `generate()` would return, so a caller can
 * treat it as the single source and concatenate without branching. A provider
 * that cannot stream yields exactly one chunk — degraded delivery, identical
 * content — which is why this is safe to call unconditionally.
 *
 * Budget, kill-switches, routing and failover are deliberately NOT reimplemented
 * here: the non-streaming path owns them, and a second copy would drift. The
 * streaming path handles one provider family and defers everything else.
 */
export async function* generateStream(
  prompt: string,
  opts: GenerateOpts = {},
): AsyncGenerator<string, void, unknown> {
  // A surface's pin is consulted before the global resolution, and deliberately
  // not through resolveProvider's process-global cache (doc 31 §1.1).
  const provider = opts.provider
    ?? (await resolveProviderForSurface(opts.surface).catch(() => "none" as AiProvider))

  if (!STREAMABLE.has(provider)) {
    const text = await generate(prompt, opts)
    if (text) yield text
    return
  }

  // Everything below records exactly one row (doc 30 §1.1). Before this, a
  // streamed call that SUCCEEDED wrote nothing at all, so ANKER AI's default
  // surface was absent from ai_calls whenever it worked, and a stream that died
  // and was rescued by the blocking fallback was recorded as one ordinary call
  // that went fine — the streaming failure rate looked best when streaming was
  // worst.
  //
  // `streamed: true` marks the row so the two call shapes stay separable, and a
  // fallback's own generateDetailed row is left to describe itself: one logical
  // request then shows the stream's failure AND the rescue, which is what
  // happened. Same posture as the rest of this module's telemetry —
  // fire-and-forget, never throws, no prompt text.
  const startedAt = Date.now()

  checkAiBudget(true)
  const cfg = await activeConfig()
  // The surface's task, on the same terms as the blocking path — otherwise a
  // surface pointed at a tier would move only its non-streamed calls, which is
  // the sort of half-applied config that is worse than none.
  const surfaceTask = opts.surface ? cfg?.surfaces?.[opts.surface]?.task : undefined
  if (surfaceTask) opts = { ...opts, task: surfaceTask as TaskTag }
  // Same defaults generateDetailed uses, so a streamed call and a blocking one
  // of the same shape produce the same output.
  const max = opts.maxTokens ?? 80
  const temp = opts.temperature ?? 0.4

  let recorded = false
  const record = (ok: boolean, model: string | null, error?: string, status?: number) => {
    if (recorded) return          // a fallback path must not double-count
    recorded = true
    const who = currentAiContext()?.principal
    void recordAiCall({
      task: opts.task ?? null, provider, model, ok, streamed: true,
      error: ok ? null : (error ?? "no text"),
      httpStatus: status ?? null,
      durationMs: Date.now() - startedAt,
      workspaceId: who?.orgId ?? null,
      actorId: who?.userId ?? null,
      persona: who?.persona ?? null,
      resolution: resolveProvenance(opts, cfg),
      requestedModel: opts.requestedModel ?? null,
    })
  }

  let base: string, key: string | null, model: string
  if (provider === "qwen") {
    base = qwenBaseUrl(qwenWorkspaceOf(cfg)); key = qwenKeyOf(cfg)
    model = opts.model ?? (opts.task ? dashscopeModelChain(opts.task)[0] : qwenModelOf(cfg))
  } else if (provider === "openai") {
    base = OPENAI_API; key = openaiKeyOf(cfg); model = openaiModelOf(cfg, opts.model)
  } else {
    base = MISTRAL_API; key = mistralKeyOf(cfg); model = mistralModelOf(cfg, opts.model)
  }
  if (!key) {
    record(false, model, `no ${provider} key saved`)
    const t = await generate(prompt, opts); if (t) yield t; return
  }

  let res: Response
  try {
    await rateGate()
    res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model, messages: [{ role: "user", content: prompt }],
        max_tokens: max, temperature: temp, stream: true,
      }),
      signal: currentAiContext()?.signal
        ? AbortSignal.any([currentAiContext()!.signal!, AbortSignal.timeout(120_000)])
        : AbortSignal.timeout(120_000),
    })
  } catch (e) {
    // Never leave the caller with nothing because the stream would not open.
    record(false, model, (e as Error)?.message ?? "stream did not open")
    const t = await generate(prompt, opts); if (t) yield t; return
  }
  if (!res.ok || !res.body) {
    record(false, model, `upstream ${res.status}`, res.status)
    const t = await generate(prompt, opts); if (t) yield t; return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let produced = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      // SSE frames are newline-delimited; a frame can straddle two reads, so the
      // tail stays buffered until its terminator arrives.
      const lines = buffer.split("\n")
      buffer = lines.pop() ?? ""
      for (const line of lines) {
        const t = line.trim()
        if (!t.startsWith("data:")) continue
        const data = t.slice(5).trim()
        if (!data || data === "[DONE]") continue
        try {
          const delta = JSON.parse(data)?.choices?.[0]?.delta?.content
          if (typeof delta === "string" && delta) { produced = true; yield delta }
        } catch { /* a partial or non-JSON frame is skipped, not fatal */ }
      }
    }
  } finally {
    reader.cancel().catch(() => {})
    // In `finally`, so a caller that abandons the generator mid-stream is still
    // recorded. An abandoned stream that produced text is a success: the bytes
    // were served, and whether the consumer kept reading is not this layer's
    // business. `recorded` makes the ordering safe — whichever of this and the
    // empty-stream branch below runs first wins, and the other is a no-op.
    record(produced, model)
  }
  // An opened-but-empty stream is a failure the caller should not have to detect.
  if (!produced) { const t = await generate(prompt, opts); if (t) yield t }
}
