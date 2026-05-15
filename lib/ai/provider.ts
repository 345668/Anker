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

export type AiProvider = "anthropic" | "ollama" | "none"

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

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434"
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_MODEL || "gemma2:2b"
const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5-20251001"

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

  // 1. Runtime admin override — wins.
  let config: AiRouterConfig | null = readRouterConfigSync()
  if (!config) {
    config = await readRouterConfig().catch(() => null)
  }
  if (config?.providerOverride) {
    _resolved = config.providerOverride
    return _resolved
  }

  const explicit = process.env.AI_PROVIDER as AiProvider | undefined
  if (explicit && ["anthropic", "ollama", "none"].includes(explicit)) {
    _resolved = explicit
    return _resolved
  }
  const key = process.env.ANTHROPIC_API_KEY
  if (key && key !== "stub") {
    _resolved = "anthropic"
    return _resolved
  }
  // Probe Ollama — give it a slightly larger timeout than before so a
  // slow-starting daemon doesn't get a false negative.
  try {
    const res = await fetch(`${OLLAMA_URL}/api/version`, {
      signal: AbortSignal.timeout(1500),
    })
    if (res.ok) {
      _resolved = "ollama"
      return _resolved
    }
  } catch {
    // not running
  }
  _resolved = "none"
  return _resolved
}

/** Reset cached probe — useful for tests. */
export function resetProvider(): void {
  _resolved = null
  _anthropic = null
}

export async function isAvailable(): Promise<boolean> {
  return (await resolveProvider()) !== "none"
}

/**
 * Generate one short completion. Returns "" on failure (callers should
 * fall back to rule-based output).
 */
export async function generate(prompt: string, opts: GenerateOpts = {}): Promise<string> {
  // Per-task admin kill-switch.  When the admin has flipped this task
  // off in /dashboard/admin/ai-config the call returns "" immediately
  // so callers fall back to their deterministic / heuristic path.
  if (opts.task) {
    const cfg = readRouterConfigSync() ?? await readRouterConfig().catch(() => null)
    if (!isTaskEnabled(cfg, opts.task)) {
      return ""
    }
  }

  const provider = await resolveProvider()
  const max = opts.maxTokens ?? 80
  const temp = opts.temperature ?? 0.4

  if (provider === "anthropic") {
    if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
    try {
      const resp = await _anthropic.messages.create({
        model: opts.model ?? ANTHROPIC_DEFAULT_MODEL,
        max_tokens: max,
        temperature: temp,
        messages: [{ role: "user", content: prompt }],
      })
      const block = resp.content[0]
      return block?.type === "text" ? block.text.trim() : ""
    } catch (e) {
      console.error("[ai/anthropic] error:", (e as Error).message)
      return ""
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
      console.error("[ai/ollama] no models available — pull at least one (e.g. `ollama pull gemma2:2b`)")
      return ""
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
              return (j2.response ?? "").trim()
            }
          }
        }
        console.error("[ai/ollama] non-200:", res.status)
        return ""
      }
      const json = (await res.json()) as { response?: string }
      return (json.response ?? "").trim()
    } catch (e) {
      console.error("[ai/ollama] error:", (e as Error).message)
      return ""
    }
  }

  return ""
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
  if (p === "anthropic") return { provider: p, model: ANTHROPIC_DEFAULT_MODEL, url: null, routing: null }
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
