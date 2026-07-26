/**
 * Semantic layer for founder→investor matching. Embeds the startup once and
 * pulls the top-K most similar firms/investors by pgvector cosine distance,
 * returning a per-id similarity map (0–1) that the scorer blends into the
 * structured score.
 *
 * Fully OPTIONAL and graceful: if no embedding provider is configured, or the
 * investor embeddings haven't been backfilled, it returns empty maps and the
 * engine behaves exactly as before (structured-only). Nothing throws.
 *
 * Prereqs to activate (ops):
 *   1. investment_firms.embedding / investors.embedding populated
 *      (`node scripts/backfill-embeddings.mjs`)
 *   2. an embedding provider reachable (Gemini key, or Ollama for local)
 */
import { sql } from "@/lib/db"
import { embed, toVectorLiteral } from "@/lib/ai/embeddings"
import type { StartupProfile } from "./founder-types"

export type SimMap = Map<string, number>

export interface SemanticResult {
  firms: SimMap
  contacts: SimMap
  /** True when at least one similarity was resolved (embeddings present + provider up). */
  enabled: boolean
}

const EMPTY: SemanticResult = { firms: new Map(), contacts: new Map(), enabled: false }

/** The text we embed to represent the startup for similarity search. */
export function startupEmbeddingText(s: StartupProfile): string {
  return [
    s.name,
    s.oneLiner,
    s.description,
    s.primarySector,
    (s.sectors || []).join(", "),
    (s.thesisKeywords || []).join(", "),
    s.pitchDeckSummary,
  ].filter(Boolean).join(". ").slice(0, 4000)
}

/**
 * Resolve semantic similarity maps for a startup. `topK` caps how many
 * near-neighbours we score semantically (the rest get 0 — they're not a
 * semantic match anyway). Uses the HNSW cosine index, so it's fast.
 */
export async function semanticScoresFor(startup: StartupProfile, topK = 3000): Promise<SemanticResult> {
  const text = startupEmbeddingText(startup)
  if (!text.trim()) return EMPTY

  let vec: number[] | null = null
  try {
    vec = await embed(text)
  } catch {
    vec = null
  }
  if (!vec) return EMPTY // no provider / unreachable → structured-only

  const lit = toVectorLiteral(vec)
  const firms: SimMap = new Map()
  const contacts: SimMap = new Map()
  try {
    const fr = (await sql.unsafe(
      `SELECT id, 1 - (embedding <=> $1::vector) AS sim
         FROM investment_firms
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      [lit, topK],
    )) as any[]
    for (const r of fr) firms.set(String(r.id), clamp01(Number(r.sim)))

    const ir = (await sql.unsafe(
      `SELECT id, 1 - (embedding <=> $1::vector) AS sim
         FROM investors
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT $2`,
      [lit, topK],
    )) as any[]
    for (const r of ir) contacts.set(String(r.id), clamp01(Number(r.sim)))
  } catch (e: any) {
    console.warn("[semantic] similarity query failed:", e?.message ?? e)
    return EMPTY
  }

  return { firms, contacts, enabled: firms.size > 0 || contacts.size > 0 }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}
