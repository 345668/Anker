/**
 * Semantic layer for founder→investor matching. Embeds the startup once and
 * pulls the top-K most similar firms/investors by pgvector cosine distance,
 * returning per-id similarity maps the scorer calibrates (doc 11 §4.2).
 *
 * Two rules this layer broke before (doc 10 D2, D3), and now holds:
 *   1. The query vector has the dimension of the LIVE column. The columns are
 *      vector(1024) in production while the code assumed 768, so every query
 *      vector was dropped and semantic scored 0 for every investor.
 *   2. Only vectors from the same model are compared. The query is embedded
 *      with the corpus's own provider and model, and neighbours are filtered
 *      on `embedding_model`. Cosines across models look valid and mean nothing.
 *
 * When it cannot run, it says why (`status: "unavailable"`, `reason`) instead
 * of silently contributing nothing.
 */
import { sql, unsafeWithSettings } from "@/lib/db"
import { embedLikeCorpus, toVectorLiteral } from "@/lib/ai/embeddings"
import type { StartupProfile } from "./founder-types"

export type SimMap = Map<string, number>

export interface SemanticResult {
  firms: SimMap
  contacts: SimMap
  /** True when at least one similarity was resolved. */
  enabled: boolean
  status: "ok" | "unavailable"
  reason: string | null
  /** Corpus model per table, e.g. "mistral:mistral-embed". */
  models: { firms: string | null; contacts: string | null }
}

const EMPTY = (reason: string, models: SemanticResult["models"] = { firms: null, contacts: null }): SemanticResult =>
  ({ firms: new Map(), contacts: new Map(), enabled: false, status: "unavailable", reason, models })

/** The text we embed to represent the startup — now including the deck summary, which the schema used to strip. */
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

type Table = "investment_firms" | "investors"
interface Corpus { model: string | null; dim: number | null }
const corpusCache = new Map<Table, { at: number; value: Corpus }>()

/** The dominant stored model and the live column dimension, cached for 10 minutes per process. */
export async function corpusInfo(table: Table): Promise<Corpus> {
  const hit = corpusCache.get(table)
  if (hit && Date.now() - hit.at < 600_000) return hit.value
  // Table names come from the fixed union above, never from input.
  const [m] = await sql.unsafe(
    `SELECT embedding_model AS model FROM ${table} WHERE embedding IS NOT NULL GROUP BY 1 ORDER BY count(*) DESC LIMIT 1`,
  )
  const [d] = await sql.unsafe(
    `SELECT format_type(a.atttypid, a.atttypmod) AS t FROM pg_attribute a
      WHERE a.attrelid = '${table}'::regclass AND a.attname = 'embedding' AND NOT a.attisdropped`,
  )
  const dim = Number(String(d?.t ?? "").match(/vector\((\d+)\)/)?.[1]) || null
  const value = { model: m?.model ?? null, dim }
  corpusCache.set(table, { at: Date.now(), value })
  return value
}

async function neighbours(table: Table, corpus: Corpus, text: string, topK: number): Promise<{ sims: SimMap; reason: string | null }> {
  if (!corpus.model || !corpus.dim) return { sims: new Map(), reason: `${table} has no stored embeddings` }
  const { vector, reason } = await embedLikeCorpus(text, corpus.model, corpus.dim)
  if (!vector) return { sims: new Map(), reason }
  // HNSW returns at most ef_search rows (default 40). pgvector 0.8's iterative
  // scan keeps searching until LIMIT is met; relaxed order is re-sorted outside.
  const rows = await unsafeWithSettings(
    [["hnsw.ef_search", "1000"], ["hnsw.iterative_scan", "relaxed_order"], ["hnsw.max_scan_tuples", "100000"]],
    `SELECT id, sim FROM (
       SELECT id, 1 - (embedding <=> $1::vector) AS sim
         FROM ${table}
        WHERE embedding IS NOT NULL AND embedding_model = $2
        ORDER BY embedding <=> $1::vector
        LIMIT $3
     ) n ORDER BY sim DESC`,
    [toVectorLiteral(vector), corpus.model, topK],
  )
  const sims: SimMap = new Map()
  for (const r of rows) sims.set(String(r.id), clamp01(Number(r.sim)))
  return { sims, reason: null }
}

/**
 * Resolve semantic similarity maps for a startup. By default every stored
 * vector is scored (the iterative HNSW scan covers all ~66k rows in about
 * two seconds), so no investor is left without semantic evidence; a smaller
 * `topK` scores only the nearest.
 */
export async function semanticScoresFor(startup: StartupProfile, topK = 60_000): Promise<SemanticResult> {
  const text = startupEmbeddingText(startup)
  if (!text.trim()) return EMPTY("the profile has no text to embed")
  let firmsCorpus: Corpus, contactsCorpus: Corpus
  try {
    ;[firmsCorpus, contactsCorpus] = await Promise.all([corpusInfo("investment_firms"), corpusInfo("investors")])
  } catch (e: any) {
    return EMPTY(`could not read the embedding columns: ${e?.message ?? e}`)
  }
  const models = { firms: firmsCorpus.model, contacts: contactsCorpus.model }
  try {
    const [f, c] = await Promise.all([
      neighbours("investment_firms", firmsCorpus, text, topK),
      neighbours("investors", contactsCorpus, text, topK),
    ])
    const enabled = f.sims.size > 0 || c.sims.size > 0
    return {
      firms: f.sims, contacts: c.sims, enabled, models,
      status: enabled ? "ok" : "unavailable",
      reason: enabled ? null : (f.reason ?? c.reason ?? "no neighbours returned"),
    }
  } catch (e: any) {
    console.warn("[semantic] similarity query failed:", e?.message ?? e)
    return EMPTY(`similarity query failed: ${e?.message ?? e}`, models)
  }
}

/**
 * Calibrate raw cosines within the run (doc 11 §4.2). Absolute values differ
 * between embedding models, so a similarity counts by its RANK among every
 * investor scored: the 75th percentile → 0, the closest → 1, linear in
 * between — only the closest quarter earns semantic credit. Rank-based, so
 * nothing saturates (a p50/p95 clamp gave the closest ~5% all exactly 1.0).
 */
export function calibrate(sims: SimMap, floor = 0.75): SimMap {
  const entries = [...sims.entries()].sort((a, b) => a[1] - b[1])
  const n = entries.length
  if (n < 20) return new Map(entries.map(([k, v]) => [k, clamp01(v)]))
  const out: SimMap = new Map()
  let i = 0
  while (i < n) {
    // Equal similarities share their average rank, so equal evidence scores equally.
    let j = i
    while (j + 1 < n && entries[j + 1][1] === entries[i][1]) j++
    const pct = ((i + j) / 2) / (n - 1)
    for (let k = i; k <= j; k++) out.set(entries[k][0], clamp01((pct - floor) / (1 - floor)))
    i = j + 1
  }
  return out
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}
