/**
 * GET /api/campaign/embeddings  — admin: embedding coverage for the semantic
 * matching layer. Reports, per table, how many rows are embedded, with which
 * model(s), so the admin can watch a backfill fill up and confirm the match-time
 * provider agrees with the stored vectors.
 */
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function coverage(table: string) {
  try {
    const [row] = await sql.unsafe(
      `SELECT COUNT(*)::int AS total, COUNT(embedding)::int AS embedded FROM ${table}`,
    ) as any[]
    const models = await sql.unsafe(
      `SELECT COALESCE(embedding_model, 'unknown') AS model, COUNT(*)::int AS n
         FROM ${table} WHERE embedding IS NOT NULL
        GROUP BY 1 ORDER BY 2 DESC LIMIT 5`,
    ) as any[]
    const total = Number(row?.total ?? 0)
    const embedded = Number(row?.embedded ?? 0)
    return {
      table,
      total,
      embedded,
      pct: total ? Math.round((embedded / total) * 100) : 0,
      models: models.map((m) => ({ model: m.model, n: Number(m.n) })),
      available: true,
    }
  } catch (e: any) {
    // embedding column not present (migration not run) → semantic layer inert
    return { table, total: 0, embedded: 0, pct: 0, models: [], available: false, error: e?.message ?? "unavailable" }
  }
}

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  const [firms, investors] = await Promise.all([
    coverage("investment_firms"),
    coverage("investors"),
  ])

  const provider =
    (process.env.EMBED_PROVIDER || "auto").toLowerCase() === "auto"
      ? (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY ? "gemini (auto)"
        : process.env.OPENAI_API_KEY ? "openai (auto)"
        : process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY ? "qwen (auto)"
        : process.env.VOYAGE_API_KEY ? "voyage (auto)"
        : "none")
      : (process.env.EMBED_PROVIDER as string).toLowerCase()

  const anyEmbedded = firms.embedded + investors.embedded > 0
  return NextResponse.json({
    provider,
    dim: Number(process.env.EMBED_DIM ?? 768),
    // Semantic scoring only actually contributes when there are stored vectors
    // AND a match-time provider is configured.
    active: anyEmbedded && provider !== "none",
    tables: [firms, investors],
  })
}
