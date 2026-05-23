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

export type AiProvider = "anthropic" | "ollama" | "gemini" | "none"

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
}

let _resolved: AiProvider | null = null
let _anthropic: Anthropic | null = null
let _anthropicKey: string | null = null

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434"
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_MODEL || "gemma2:2b"
const ANTHROPIC_DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001"
const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta/models"
const GEMINI_DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash"

// ─── key / mode resolution (runtime config wins over env) ────────────────
function geminiKeyOf(cfg: AiRouterConfig | null): string | null {
  return cfg?.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null
}
function anthropicKeyOf(cfg: AiRouterConfig | null): string | null {
  const k = cfg?.anthropicApiKey || process.env.ANTHROPIC_API_KEY || null
  return k && k !== "stub" ? k : null
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
  if (explicit && ["anthropic", "ollama", "gemini", "none"].includes(explicit)) {
    _resolved = explicit
    return _resolved
  }

  // 3. Cloud keys (set in Settings → API Keys). Gemini, then Claude.
  if (geminiKeyOf(config)) { _resolved = "gemini"; return _resolved }
  if (anthropicKeyOf(config)) { _resolved = "anthropic"; return _resolved }

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
    const cfg = readRouterConfigSync() ?? await readRouterConfig().catch(() => null)
    if (!isTaskEnabled(cfg, opts.task)) {
      return { text: "", error: `task '${opts.task}' disabled by admin`, provider: "none", model: null }
    }
  }

  const provider = await resolveProvider()
  const max = opts.maxTokens ?? 80
  const temp = opts.temperature ?? 0.4
  const cfg = await activeConfig()

  if (provider === "gemini") {
    const key = geminiKeyOf(cfg)
    if (!key) return { text: "", error: "no Gemini API key configured", provider, model: null }
    const model = geminiModelOf(cfg, opts.model)
    // Flash-thinking models (2.5-flash) can spend the *entire* output
    // budget on internal reasoning and return a candidate with zero
    // visible text + finishReason=MAX_TOKENS.  Give a sane floor so a
    // small maxTokens (e.g. the 40 used by the self-test) still yields
    // visible output across every Gemini model.
    const maxOut = Math.max(max, 512)
    try {
      const res = await fetch(`${GEMINI_API}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: maxOut,
            temperature: temp,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        const raw = (await res.text().catch(() => "")).slice(0, 400)
        let detail = raw
        try { detail = (JSON.parse(raw) as any)?.error?.message || raw } catch { /* not JSON */ }
        const error = `HTTP ${res.status}: ${detail}`.slice(0, 300)
        console.error("[ai/gemini] non-200:", res.status, detail.slice(0, 200))
        return { text: "", error, status: res.status, provider, model }
      }
      const data = (await res.json().catch(() => ({}))) as any
      const cand = data?.candidates?.[0]
      const parts = cand?.content?.parts
      const text = Array.isArray(parts) ? parts.map((p: any) => p?.text ?? "").join("") : ""
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
    } catch (e) {
      const error = (e as Error).name === "TimeoutError" ? "request timed out (120s)" : (e as Error).message
      console.error("[ai/gemini] error:", error)
      return { text: "", error, provider, model }
    }
  }

  if (provider === "anthropic") {
    const key = anthropicKeyOf(cfg)
    if (!key) return { text: "", error: "no Anthropic API key configured", provider, model: null }
    const model = anthropicModelOf(cfg, opts.model)
    if (!_anthropic || _anthropicKey !== key) { _anthropic = new Anthropic({ apiKey: key }); _anthropicKey = key }
    try {
      const resp = await _anthropic.messages.create({
        model,
        max_tokens: max,
        temperature: temp,
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

  if (provider === "ollama") {
    // Pick the right local model for this task. Order of precedence:
    //   1. opts.model (explicit caller override)
    //   2. multi-model router for opts.task
    //   3. legacy OLLAMA_MODEL env
    // Then verify the model is actually pulled — if not, fall back
    // through the chain to the first available model.  This prevents
    // a hard 404 when the user hasn't `ollama pull`-ed every tier.
    const requested =
      opts.model ??
      (opts.task ? modelForTask(opts.task) : OLLAMA_DEFAULT_MODEL)
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
          model: ollamaModel,
          prompt,
          stream: false,
          ...(opts.json ? { format: "json" } : {}),
          options: { num_predict: max, temperature: temp },
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
        // 404 = model unrecognised by Ollama — invalidate cache and
        // retry once with the second-best fallback.
        if (res.status === 404) {
          invalidateModelsCache()
          const retryModel = await pickAvailableOllamaModel(undefined)
          if (retryModel && retryModel !== ollamaModel) {
            console.warn(`[ai/ollama] retry with fallback model '${retryModel}'`)
            const r2 = await fetch(`${OLLAMA_URL}/api/generate`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                model: retryModel,
                prompt,
                stream: false,
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

  return { text: "", error: "no AI provider active (set a Gemini/Claude key, or enable local models)", provider: "none", model: null }
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
  // Anthropic can handle 10 in flight comfortably
  const limit = provider === "anthropic" ? Math.max(concurrency, 8) : concurrency

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
