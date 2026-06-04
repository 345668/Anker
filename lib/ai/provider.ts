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
import { modelForTask, type TaskTag } from "./model-router"
import {
  readRouterConfig, readRouterConfigSync, isTaskEnabled,
  type AiRouterConfig,
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
}

let _resolved: AiProvider | null = null
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
async function activeConfig(): Promise<AiRouterConfig | null> {
  return readRouterConfigSync() ?? (await readRouterConfig().catch(() => null))
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
export async function resolveProvider(): Promise<AiProvider> {
  if (_resolved) return _resolved

  // 1. Runtime admin override — wins (lets Settings force a provider).
  let config: AiRouterConfig | null = readRouterConfigSync()
  if (!config) {
    config = await readRouterConfig().catch(() => null)
  }
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
  if (anthropicKeyOf(config)) { _resolved = "anthropic"; return _resolved }
  if (geminiKeyOf(config)) { _resolved = "gemini"; return _resolved }
  if (openaiKeyOf(config)) { _resolved = "openai"; return _resolved }
  if (qwenKeyOf(config)) { _resolved = "qwen"; return _resolved }
  if (mistralKeyOf(config)) { _resolved = "mistral"; return _resolved }

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

/** Reset cached probe — useful for tests. */
export function resetProvider(): void {
  _resolved = null
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
}

/**
 * Generate one short completion. Returns "" on failure (callers should
 * fall back to rule-based output).  Thin wrapper over generateDetailed().
 */
export async function generate(prompt: string, opts: GenerateOpts = {}): Promise<string> {
  return (await generateDetailed(prompt, opts)).text
}

/**
 * Like generate(), but returns a structured result that surfaces the
 * real failure reason (HTTP status, API error message, finishReason,
 * safety block, etc).  Used by the Settings → API Keys self-test so a
 * failing probe shows *why* — not just "empty response".
 */
export async function generateDetailed(prompt: string, opts: GenerateOpts = {}): Promise<GenerateResult> {
  // Per-task admin kill-switch.  When the admin has flipped this task
  // off in /dashboard/admin/ai-config the call returns "" immediately
  // so callers fall back to their deterministic / heuristic path.
  if (opts.task) {
    const cfgT = readRouterConfigSync() ?? await readRouterConfig().catch(() => null)
    if (!isTaskEnabled(cfgT, opts.task)) {
      return { text: "", error: `task '${opts.task}' disabled by admin`, provider: "none", model: null }
    }
  }

  const cfg = await activeConfig()
  const max = opts.maxTokens ?? 80
  const temp = opts.temperature ?? 0.4

  // Provider chain. Forced selection (admin override / AI_PROVIDER env) is a
  // single-element chain (no failover). "Auto" yields Gemini → Claude → local,
  // so a 429/5xx on one provider falls over to the next that has a key.
  let chain = providerChain(cfg)
  if (opts.noFailover && chain.length > 1) chain = [chain[0]]
  if (opts.provider && opts.provider !== "none") chain = [opts.provider]

  let last: GenerateResult | null = null
  const attempts: string[] = []
  for (const p of chain) {
    last = await runProvider(p, prompt, opts, cfg, max, temp)
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
export function providerChain(cfg: AiRouterConfig | null): AiProvider[] {
  if (cfg?.providerOverride) return [cfg.providerOverride]
  const env = process.env.AI_PROVIDER as AiProvider | undefined
  if (env && ["anthropic", "ollama", "gemini", "openai", "mistral", "qwen", "none"].includes(env)) return [env]
  const chain: AiProvider[] = []
  if (anthropicKeyOf(cfg)) chain.push("anthropic")
  if (geminiKeyOf(cfg)) chain.push("gemini")
  if (openaiKeyOf(cfg)) chain.push("openai")
  if (mistralKeyOf(cfg)) chain.push("mistral")
  if (qwenKeyOf(cfg)) chain.push("qwen")
  if (localEnabledOf(cfg)) chain.push("ollama")
  return chain.length ? chain : ["none"]
}

async function runProvider(
  p: AiProvider, prompt: string, opts: GenerateOpts,
  cfg: AiRouterConfig | null, max: number, temp: number,
): Promise<GenerateResult> {
  if (p === "anthropic") return runAnthropic(prompt, opts, cfg, max, temp)
  if (p === "gemini") return runGemini(prompt, opts, cfg, max, temp)
  if (p === "openai") return runOpenAICompatible("openai", OPENAI_API, openaiKeyOf(cfg), openaiModelOf(cfg, opts.model), prompt, opts, max, temp)
  if (p === "mistral") return runOpenAICompatible("mistral", MISTRAL_API, mistralKeyOf(cfg), mistralModelOf(cfg, opts.model), prompt, opts, max, temp)
  if (p === "qwen") return runOpenAICompatible("qwen", qwenBaseUrl(qwenWorkspaceOf(cfg)), qwenKeyOf(cfg), qwenModelOf(cfg, opts.model), prompt, opts, max, temp)
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
        signal: AbortSignal.timeout(120_000),
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
    if (!text) return { text: "", error: `empty response (finish_reason=${finishReason ?? "?"})`, finishReason, provider, model }
    return { text, error: null, finishReason, provider, model }
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
        signal: AbortSignal.timeout(120_000),
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
    if (!text.trim()) {
      const block = data?.promptFeedback?.blockReason
      const error = block
        ? `blocked by safety filter: ${block}`
        : finishReason
          ? `empty response (finishReason=${finishReason}${finishReason === "MAX_TOKENS" ? " — raise maxOutputTokens" : ""})`
          : "empty response (no candidates returned)"
      return { text: "", error, finishReason, provider, model }
    }
    return { text: text.trim(), error: null, finishReason, provider, model }
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
    if (!text) return { text: "", error: `empty response (stop_reason=${resp.stop_reason ?? "?"})`, finishReason: resp.stop_reason ?? null, provider, model }
    return { text, error: null, finishReason: resp.stop_reason ?? null, provider, model }
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
      signal: AbortSignal.timeout(120_000),
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
            signal: AbortSignal.timeout(120_000),
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

import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"

export interface AiSdkModelConfig {
  model: LanguageModel     // The actual AI SDK model instance
  provider: AiProvider
  modelName: string        // The model name for display
}

/**
 * Get an AI SDK model instance based on the active runtime configuration.
 * This allows chat routes and other AI SDK consumers to use the saved API keys.
 */
export async function getAiSdkModel(): Promise<AiSdkModelConfig> {
  const cfg = await activeConfig()
  const provider = await resolveProvider()
  
  switch (provider) {
    case "anthropic": {
      const modelName = anthropicModelOf(cfg)
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
      const modelName = geminiModelOf(cfg)
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
      const modelName = openaiModelOf(cfg)
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
      const modelName = mistralModelOf(cfg)
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
      const modelName = qwenModelOf(cfg)
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
      const modelName = OLLAMA_DEFAULT_MODEL
      const ollamaProvider = createOpenAICompatible({
        name: "ollama",
        baseURL: `${OLLAMA_HOST}/v1`,
      })
      return { model: ollamaProvider.chatModel(modelName), provider, modelName }
    }
    default:
      throw new Error("No AI provider configured. Please set an API key in Settings > API Keys.")
  }
}
