/**
 * Embeddings — multi-provider, 768-d by default.
 *
 * `embed(text)` returns a number[] of dimension EMBEDDING_DIM, or null when the
 * selected provider is unreachable/unconfigured. Providers:
 *
 *   gemini   Google text-embedding-004 (native 768)          GEMINI_API_KEY
 *   openai   text-embedding-3-small, dimensions=EMBED_DIM     OPENAI_API_KEY
 *   qwen     Alibaba DashScope text-embedding-v3 (OpenAI-     DASHSCOPE_API_KEY
 *            compatible, dimensions=EMBED_DIM)                (or QWEN_API_KEY)
 *   voyage   Voyage AI (this is the "claude"/anthropic        VOYAGE_API_KEY
 *            option — Anthropic has NO embeddings API and
 *            officially recommends Voyage)
 *   ollama   local models, default nomic-embed-text; also     (local daemon)
 *            runs Qwen embedding models (OLLAMA_EMBED_MODEL)
 *
 * Select with EMBED_PROVIDER=gemini|openai|qwen|voyage|claude|ollama|auto
 * (auto = first provider whose key/daemon is available). Model/dim overrides:
 *   EMBED_DIM (default 768; MUST match the pgvector column + the model output)
 *   GEMINI_EMBED_MODEL / OPENAI_EMBED_MODEL / QWEN_EMBED_MODEL /
 *   VOYAGE_EMBED_MODEL / OLLAMA_EMBED_MODEL
 *
 * CRITICAL: the same provider+model must be used to embed BOTH the stored rows
 * (backfill) AND the query text (match time) — different models produce
 * incompatible vector spaces. `scripts/backfill-embeddings.mjs` mirrors this
 * exact dispatch so the two always agree when given the same env.
 */

import { readRouterConfigSync, readRouterConfig } from "./runtime-config"

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "")
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text"
export const EMBEDDING_DIM = Number(process.env.EMBED_DIM ?? process.env.OLLAMA_EMBED_DIM ?? 768)

const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004"
const OPENAI_EMBED_MODEL = process.env.OPENAI_EMBED_MODEL ?? "text-embedding-3-small"
const QWEN_EMBED_MODEL = process.env.QWEN_EMBED_MODEL ?? "text-embedding-v3"
const QWEN_BASE_URL = (process.env.DASHSCOPE_BASE_URL ?? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1").replace(/\/+$/, "")
const VOYAGE_EMBED_MODEL = process.env.VOYAGE_EMBED_MODEL ?? "voyage-3-large"
const MISTRAL_EMBED_MODEL = process.env.MISTRAL_EMBED_MODEL ?? "mistral-embed"

export type EmbedProvider = "gemini" | "openai" | "qwen" | "voyage" | "ollama" | "mistral"

/** Reject a vector whose dimension doesn't match the schema — inserting a
 *  wrong-dim vector would corrupt similarity search. */
function fitDim(v: number[] | null): number[] | null {
  if (!Array.isArray(v)) return null
  if (v.length !== EMBEDDING_DIM) {
    console.warn(`[embeddings] dim mismatch: got ${v.length}, need ${EMBEDDING_DIM} — dropping. Set EMBED_DIM + re-migrate the vector column, or pick a model that outputs ${EMBEDDING_DIM}.`)
    return null
  }
  return v
}

/** Gemini — native 768 for text-embedding-004; newer gemini-embedding-001
 *  supports outputDimensionality. */
async function embedGemini(text: string, key: string, timeoutMs = 20_000): Promise<number[] | null> {
  return withTimeout(timeoutMs, async (signal) => {
    const body: any = { model: `models/${GEMINI_EMBED_MODEL}`, content: { parts: [{ text: text.slice(0, 8000) }] } }
    if (GEMINI_EMBED_MODEL.includes("gemini-embedding")) body.outputDimensionality = EMBEDDING_DIM
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { embedding?: { values?: number[] } }
    return json?.embedding?.values ?? null
  })
}

/** OpenAI-compatible embeddings (OpenAI + Alibaba DashScope/Qwen share this
 *  request/response shape). `dimensions` truncates Matryoshka models to fit. */
async function embedOpenAICompatible(
  baseUrl: string, model: string, key: string, text: string, timeoutMs = 20_000,
): Promise<number[] | null> {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, input: text.slice(0, 8000), dimensions: EMBEDDING_DIM }),
      signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { embedding?: number[] }[] }
    return json?.data?.[0]?.embedding ?? null
  })
}

/** Voyage AI — the embeddings provider for the Claude/Anthropic stack
 *  (Anthropic has no embeddings endpoint). output_dimension supported on
 *  voyage-3-large ∈ {256,512,1024,2048}. */
async function embedVoyage(text: string, key: string, timeoutMs = 20_000): Promise<number[] | null> {
  return withTimeout(timeoutMs, async (signal) => {
    const body: any = { model: VOYAGE_EMBED_MODEL, input: [text.slice(0, 8000)] }
    if ([256, 512, 1024, 2048].includes(EMBEDDING_DIM)) body.output_dimension = EMBEDDING_DIM
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body), signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { embedding?: number[] }[] }
    return json?.data?.[0]?.embedding ?? null
  })
}

/** Ollama — local models (`/api/embed`, legacy `/api/embeddings` fallback). */
async function embedOllama(text: string, model: string, timeoutMs = 20_000): Promise<number[] | null> {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text.slice(0, 8000) }), signal,
    })
    if (res.ok) {
      const json = (await res.json()) as { embeddings?: number[][] }
      if (Array.isArray(json?.embeddings?.[0])) return json.embeddings![0]
    }
    const legacy = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text.slice(0, 8000) }), signal,
    })
    if (!legacy.ok) return null
    const json = (await legacy.json()) as { embedding?: number[] }
    return json?.embedding ?? null
  })
}

/** Mistral embeddings — mistral-embed is fixed 1024-d (no dimensions param),
 *  so it only fits a 1024-d vector column (set EMBED_DIM=1024 + re-migrate). */
async function embedMistral(text: string, key: string, timeoutMs = 20_000): Promise<number[] | null> {
  return withTimeout(timeoutMs, async (signal) => {
    const res = await fetch("https://api.mistral.ai/v1/embeddings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MISTRAL_EMBED_MODEL, input: [text.slice(0, 8000)] }),
      signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { embedding?: number[] }[] }
    return json?.data?.[0]?.embedding ?? null
  })
}

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T | null>): Promise<T | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fn(ctrl.signal) } catch { return null } finally { clearTimeout(timer) }
}

export interface EmbedOptions {
  model?: string
  provider?: EmbedProvider
  /** Per-request timeout (ms). Default 20s. */
  timeoutMs?: number
}

interface ProviderKeys {
  gemini: string | null
  openai: string | null
  qwen: string | null
  voyage: string | null
  mistral: string | null
  localOn: boolean
}

function resolveKeys(cfg: any): ProviderKeys {
  return {
    gemini: cfg?.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null,
    openai: cfg?.openaiApiKey || process.env.OPENAI_API_KEY || null,
    qwen: cfg?.qwenApiKey || process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || null,
    mistral: cfg?.mistralApiKey || process.env.MISTRAL_API_KEY || null,
    voyage: process.env.VOYAGE_API_KEY || null,
    localOn: cfg?.localEnabled === true || process.env.LOCAL_AI_ENABLED === "true" || process.env.AI_PROVIDER === "ollama",
  }
}

function hasKey(keys: ProviderKeys, p: EmbedProvider): boolean {
  return p === "ollama" ? keys.localOn : !!keys[p as "gemini" | "openai" | "qwen" | "voyage" | "mistral"]
}

/**
 * Which embedding provider to use, in priority order:
 *   1. explicit override (opts.provider or EMBED_PROVIDER env)
 *   2. the app's configured provider from Settings → API Keys
 *      (router config `providerOverride`) — so embeddings follow the SAME
 *      provider as generation. Anthropic has no embeddings → falls through
 *      (Voyage if a Voyage key is set, else the next configured provider).
 *   3. auto: the first provider with a configured key/daemon.
 */
function selectProvider(keys: ProviderKeys, cfg: any, override?: EmbedProvider): EmbedProvider | null {
  const all: EmbedProvider[] = ["gemini", "openai", "qwen", "mistral", "voyage", "ollama"]
  const alias = (p: string) => (p === "claude" || p === "anthropic" ? "voyage" : p)

  // 1. explicit override
  const rawOverride = (override || process.env.EMBED_PROVIDER || "").toLowerCase()
  if (rawOverride && rawOverride !== "auto") {
    const n = alias(rawOverride)
    return all.includes(n as EmbedProvider) ? (n as EmbedProvider) : null
  }

  // 2. follow the settings provider (embeddings-capable ones)
  const settingsProvider = (cfg?.providerOverride ?? null) as string | null
  if (settingsProvider && settingsProvider !== "none") {
    const n = alias(settingsProvider)
    if (all.includes(n as EmbedProvider) && hasKey(keys, n as EmbedProvider)) return n as EmbedProvider
    // anthropic (or an unconfigured settings provider) → fall through to auto
  }

  // 3. auto — first configured
  for (const p of all) if (hasKey(keys, p)) return p
  return null
}

/** Embed one text with the configured provider. Returns null on failure so
 *  callers fall back to structured-only behavior. */
export async function embed(text: string, opts: EmbedOptions = {}): Promise<number[] | null> {
  if (!text || text.length === 0) return null
  const cfg = readRouterConfigSync() ?? (await readRouterConfig().catch(() => null))
  const keys = resolveKeys(cfg)
  const provider = selectProvider(keys, cfg, opts.provider)
  if (!provider) return null

  let v: number[] | null = null
  switch (provider) {
    case "gemini":  v = keys.gemini ? await embedGemini(text, keys.gemini, opts.timeoutMs) : null; break
    case "openai":  v = keys.openai ? await embedOpenAICompatible("https://api.openai.com/v1", opts.model ?? OPENAI_EMBED_MODEL, keys.openai, text, opts.timeoutMs) : null; break
    case "qwen":    v = keys.qwen ? await embedOpenAICompatible(QWEN_BASE_URL, opts.model ?? QWEN_EMBED_MODEL, keys.qwen, text, opts.timeoutMs) : null; break
    case "mistral": v = keys.mistral ? await embedMistral(text, keys.mistral, opts.timeoutMs) : null; break
    case "voyage":  v = keys.voyage ? await embedVoyage(text, keys.voyage, opts.timeoutMs) : null; break
    case "ollama":  v = keys.localOn ? await embedOllama(text, opts.model ?? EMBED_MODEL, opts.timeoutMs) : null; break
  }
  return fitDim(v)
}

/** Batch helper — small concurrency to keep Ollama happy. */
export async function embedBatch(
  texts: string[],
  opts: EmbedOptions & { concurrency?: number } = {},
): Promise<(number[] | null)[]> {
  const concurrency = Math.max(1, Math.min(8, opts.concurrency ?? 4))
  const out: (number[] | null)[] = new Array(texts.length).fill(null)
  let cursor = 0
  async function worker() {
    while (true) {
      const i = cursor++
      if (i >= texts.length) return
      out[i] = await embed(texts[i], opts)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, texts.length) }, worker))
  return out
}

/** Format a float[] as a Postgres `vector(...)` literal. */
export function toVectorLiteral(v: number[]): string {
  return "[" + v.join(",") + "]"
}

/** Build the canonical "text we embed" for an investment firm. */
export function firmEmbeddingText(firm: any): string {
  const parts = [
    firm.name,
    firm.type ?? firm.firm_type,
    firm.hq_location ?? firm.location,
    firm.description,
    Array.isArray(firm.sectors) ? firm.sectors.join(", ") : firm.sectors,
    Array.isArray(firm.stages) ? firm.stages.join(", ") : firm.stages,
    Array.isArray(firm.geographic_focus) ? firm.geographic_focus.join(", ") : firm.geographic_focus,
    firm.thesis_description,
    firm.value_proposition,
  ].filter(Boolean)
  return parts.join(" · ").slice(0, 6000)
}

/** Build the canonical "text we embed" for an investor (person). */
export function investorEmbeddingText(inv: any): string {
  const name = [inv.first_name, inv.last_name].filter(Boolean).join(" ")
  const parts = [
    name,
    inv.title,
    inv.investor_type,
    inv.location,
    inv.bio,
    Array.isArray(inv.sectors) ? inv.sectors.join(", ") : inv.sectors,
    Array.isArray(inv.stages) ? inv.stages.join(", ") : inv.stages,
  ].filter(Boolean)
  return parts.join(" · ").slice(0, 6000)
}

/** Build the canonical "text we embed" for a CRM entry (lead). */
export function crmEntryEmbeddingText(entry: any): string {
  const parts = [
    entry.display_name,
    entry.display_title,
    entry.display_type,
    entry.display_location,
    entry.why_match,
    entry.notes,
  ].filter(Boolean)
  return parts.join(" · ").slice(0, 6000)
}
