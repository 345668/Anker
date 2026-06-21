/**
 * POST /api/admin/news/fetch
 *
 *   Body: { region: Region, topics: Topic[], providers?: ProviderId[], limit?: number }
 *
 * Fetches news from every enabled provider in parallel, dedupes across
 * URL + canonical title, returns the merged feed.
 *
 * Errors from individual providers are reported per-provider in the
 * response so the UI can show a banner like "Marketaux returned 429 —
 * showing results from Alpha Vantage + SEC EDGAR" instead of a blanket
 * failure.
 *
 * Latency: 0.5–8s depending on which providers are enabled and how the
 * day's rate limits look. maxDuration set generously.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  PROVIDERS, providerById, dedupeAndRank, listProviders,
  type ProviderId, type NewsItem, NewsProviderError,
} from "@/lib/news/providers"
import { REGIONS, TOPICS, type Region, type Topic } from "@/lib/news/regions"

export const runtime = "nodejs"
export const maxDuration = 60

interface ProviderResult {
  provider: ProviderId
  ok: boolean
  count: number
  error?: string
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  let body: any
  try { body = await req.json() } catch { body = {} }

  const region = (REGIONS as readonly string[]).includes(body?.region) ? body.region as Region : "global"
  const topics: Topic[] = Array.isArray(body?.topics)
    ? body.topics.filter((t: any) => (TOPICS as readonly string[]).includes(t))
    : []
  const limit = clampInt(body?.limit, 5, 500, 60)

  const requested: ProviderId[] = Array.isArray(body?.providers) && body.providers.length
    ? body.providers.filter((id: any) =>
        (PROVIDERS as readonly any[]).some((p) => p.id === id))
    : PROVIDERS.map((p) => p.id) as ProviderId[]

  // Filter to providers that are actually enabled.
  const statuses = listProviders()
  const enabled = requested.filter((id) =>
    statuses.find((s) => s.id === id)?.available)

  if (enabled.length === 0) {
    return NextResponse.json({
      items: [],
      providerResults: statuses.map((s) => ({
        provider: s.id, ok: false, count: 0,
        error: s.available ? "not requested" : `disabled: ${s.requires} not set`,
      })),
      region, topics,
      error: "No providers are enabled. Set ALPHA_VANTAGE_API_KEY / FINNHUB_API_KEY / MARKETAUX_API_KEY in env, or rely on SEC EDGAR / Hacker News which work without keys.",
    }, { status: 200 })
  }

  const results = await Promise.all(enabled.map(async (id): Promise<{
    id: ProviderId
    items: NewsItem[]
    error?: string
  }> => {
    const provider = providerById(id)
    if (!provider) return { id, items: [], error: "unknown provider" }
    try {
      const items = await provider.fetch({ region, topics, limit })
      return { id, items }
    } catch (e: any) {
      const msg = e instanceof NewsProviderError ? e.message : (e?.message ?? "fetch failed")
      console.error(`[news fetch] ${id}`, msg)
      return { id, items: [], error: msg }
    }
  }))

  const allItems = results.flatMap((r) => r.items)
  const merged = dedupeAndRank(allItems).slice(0, limit)

  const providerResults: ProviderResult[] = results.map((r) => ({
    provider: r.id,
    ok: !r.error,
    count: r.items.length,
    error: r.error,
  }))

  return NextResponse.json({
    items: merged,
    totalBeforeDedupe: allItems.length,
    providerResults,
    region,
    topics,
  })
}

function clampInt(v: any, min: number, max: number, fallback: number) {
  const n = Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.trunc(n)))
}
