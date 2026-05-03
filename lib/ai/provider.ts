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

export type AiProvider = "anthropic" | "ollama" | "none"

export interface GenerateOpts {
  maxTokens?: number
  temperature?: number
  model?: string
  /** Force structured JSON output (Ollama: format='json'; Anthropic: not supported, prompt-only). */
  json?: boolean
}

let _resolved: AiProvider | null = null
let _anthropic: Anthropic | null = null

const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434"
const OLLAMA_DEFAULT_MODEL = process.env.OLLAMA_MODEL || "gemma2:2b"
const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5-20251001"

/** Resolve the active provider once per process. */
export async function resolveProvider(): Promise<AiProvider> {
  if (_resolved) return _resolved
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
  // Probe Ollama
  try {
    const res = await fetch(`${OLLAMA_URL}/api/version`, {
      signal: AbortSignal.timeout(800),
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
    try {
      const res = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: opts.model ?? OLLAMA_DEFAULT_MODEL,
          prompt,
          stream: false,
          ...(opts.json ? { format: "json" } : {}),
          options: { num_predict: max, temperature: temp },
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!res.ok) {
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
}> {
  const p = await resolveProvider()
  if (p === "anthropic") return { provider: p, model: ANTHROPIC_DEFAULT_MODEL, url: null }
  if (p === "ollama") return { provider: p, model: OLLAMA_DEFAULT_MODEL, url: OLLAMA_URL }
  return { provider: "none", model: null, url: null }
}
