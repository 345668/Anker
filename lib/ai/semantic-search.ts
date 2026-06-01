/**
 * Semantic search over investment_firms / investors / crm_entries.
 *
 * Each function takes a query string, embeds it, and runs a
 * cosine-distance search using pgvector's `<=>` operator (HNSW indexed
 * via the migration in scripts/migrations/2026-05-08-pgvector.sql).
 *
 * Distance is in [0, 2]; we expose `score = 1 - distance` so 1.0 ==
 * identical and 0.0 == orthogonal.
 *
 * Returns an empty list if the query can't be embedded — callers
 * should fall back to keyword search.
 */

import { sql } from "@/lib/db"
import { embed, toVectorLiteral } from "./embeddings"

export interface SemanticHit<T = any> {
  row: T
  score: number          // 1 - cosine distance
}

export async function similarFirms(query: string, limit = 20): Promise<SemanticHit[]> {
  const v = await embed(query)
  if (!v) return []
  const lit = toVectorLiteral(v)
  const cap = Math.max(1, Math.min(200, limit))
  const rows: any[] = await sql.unsafe(
    `SELECT id, name, type, firm_type, hq_location, sectors, description, website,
            1 - (embedding <=> $1::vector) AS score
       FROM investment_firms
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    [lit, cap],
  )
  return rows.map((r) => ({ row: r, score: Number(r.score) || 0 }))
}

export async function similarInvestors(query: string, limit = 20): Promise<SemanticHit[]> {
  const v = await embed(query)
  if (!v) return []
  const lit = toVectorLiteral(v)
  const cap = Math.max(1, Math.min(200, limit))
  const rows: any[] = await sql.unsafe(
    `SELECT id, first_name, last_name, title, email, linkedin_url, firm_id, location, bio, sectors,
            1 - (embedding <=> $1::vector) AS score
       FROM investors
      WHERE embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    [lit, cap],
  )
  return rows.map((r) => ({ row: r, score: Number(r.score) || 0 }))
}

/** Find duplicates / near-duplicates of a single firm.  Used by
 *  the admin "merge candidates" UI. */
export async function nearDuplicateFirms(firmId: string, threshold = 0.92): Promise<SemanticHit[]> {
  const [src] = await sql`SELECT embedding FROM investment_firms WHERE id = ${firmId} LIMIT 1`
  const e = (src as any)?.embedding
  if (!e) return []
  const rows: any[] = await sql.unsafe(
    `SELECT id, name, type, hq_location,
            1 - (embedding <=> $1::vector) AS score
       FROM investment_firms
      WHERE embedding IS NOT NULL AND id <> $2
      ORDER BY embedding <=> $1::vector
      LIMIT 25`,
    [typeof e === "string" ? e : toVectorLiteral(e), firmId],
  )
  return rows
    .map((r) => ({ row: r, score: Number(r.score) || 0 }))
    .filter((h) => h.score >= threshold)
}

/** "Investors like X" — given a known investor's id, find others. */
export async function similarToInvestor(investorId: string, limit = 20): Promise<SemanticHit[]> {
  const [src] = await sql`SELECT embedding FROM investors WHERE id = ${investorId} LIMIT 1`
  const e = (src as any)?.embedding
  if (!e) return []
  const rows: any[] = await sql.unsafe(
    `SELECT id, first_name, last_name, title, firm_id, location,
            1 - (embedding <=> $1::vector) AS score
       FROM investors
      WHERE embedding IS NOT NULL AND id <> $2
      ORDER BY embedding <=> $1::vector
      LIMIT $3`,
    [typeof e === "string" ? e : toVectorLiteral(e), investorId, Math.max(1, Math.min(200, limit))],
  )
  return rows.map((r) => ({ row: r, score: Number(r.score) || 0 }))
}
