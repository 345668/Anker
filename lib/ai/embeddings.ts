/**
 * Embeddings — local via Ollama (nomic-embed-text), default 768-d.
 *
 * Single function, `embed(text)`, that always returns a Float32Array
 * of dimension EMBEDDING_DIM (or null when the daemon is unreachable).
 *
 * The default model `nomic-embed-text` is open-source, ships with
 * Ollama (`ollama pull nomic-embed-text`), and is what the schema in
 * `scripts/migrations/2026-05-08-pgvector.sql` is sized for.
 *
 * Switch model + dimension via env:
 *   OLLAMA_EMBED_MODEL   default: nomic-embed-text
 *   OLLAMA_EMBED_DIM     default: 768  (must match schema!)
 */

import { readRouterConfigSync, readRouterConfig } from "./runtime-config"

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://127.0.0.1:11434").replace(/\/+$/, "")
const EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL ?? "nomic-embed-text"
export const EMBEDDING_DIM = Number(process.env.OLLAMA_EMBED_DIM ?? 768)
// Gemini text-embedding-004 is 768-d — dimension-compatible with the
// nomic-embed schema, so cloud + local embeddings interoperate.
const GEMINI_EMBED_MODEL = process.env.GEMINI_EMBED_MODEL ?? "text-embedding-004"

/** Gemini embeddings (used when a Gemini key is configured). */
async function embedGemini(text: string, key: string, timeoutMs = 20_000): Promise<number[] | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_EMBED_MODEL}:embedContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: `models/${GEMINI_EMBED_MODEL}`, content: { parts: [{ text: text.slice(0, 8000) }] } }),
        signal: ctrl.signal,
      },
    )
    if (!res.ok) return null
    const json = (await res.json()) as { embedding?: { values?: number[] } }
    const v = json?.embedding?.values
    return Array.isArray(v) ? v : null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export interface EmbedOptions {
  model?: string
  /** Per-request timeout (ms). Default 20s. */
  timeoutMs?: number
}

/** Embed one text. Returns null on failure so callers can fall back. */
export async function embed(text: string, opts: EmbedOptions = {}): Promise<number[] | null> {
  if (!text || text.length === 0) return null
  // Provider policy: Gemini embeddings when a key is set; otherwise local
  // Ollama ONLY when local models are enabled (Data Ops). Mirrors provider.ts.
  const cfg = readRouterConfigSync() ?? (await readRouterConfig().catch(() => null))
  const gKey = cfg?.geminiApiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || null
  if (gKey) {
    const v = await embedGemini(text, gKey, opts.timeoutMs).catch(() => null)
    if (v) return v
  }
  const localOn = cfg?.localEnabled === true || process.env.LOCAL_AI_ENABLED === "true" || process.env.AI_PROVIDER === "ollama"
  if (!localOn) return null
  const model = opts.model ?? EMBED_MODEL
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 20_000)
  try {
    // Ollama supports `/api/embed` (current) and `/api/embeddings` (older).
    // Try the current endpoint first.
    const res = await fetch(`${OLLAMA_URL}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: text.slice(0, 8000) }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      // Fallback to legacy endpoint shape
      return await embedLegacy(text, model, ctrl.signal)
    }
    const json = (await res.json()) as { embeddings?: number[][] }
    const v = json?.embeddings?.[0]
    return Array.isArray(v) ? v : null
  } catch {
    return await embedLegacy(text, model, ctrl.signal).catch(() => null)
  } finally {
    clearTimeout(timer)
  }
}

async function embedLegacy(text: string, model: string, signal: AbortSignal): Promise<number[] | null> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: text.slice(0, 8000) }),
      signal,
    })
    if (!res.ok) return null
    const json = (await res.json()) as { embedding?: number[] }
    return Array.isArray(json?.embedding) ? json!.embedding : null
  } catch {
    return null
  }
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
