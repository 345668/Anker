/**
 * Web search via SearXNG (self-hosted meta-search).
 *
 * Replaces the `guessUrlFromName()` hack in deep-research with an
 * actual search call.  When SearXNG isn't reachable, callers fall
 * back to the heuristic (so the rest of the platform keeps working).
 *
 * SearXNG must have JSON output enabled (we ship the right
 * `scripts/searxng/settings.yml`).
 *
 *   SEARXNG_URL    default: http://127.0.0.1:8080
 */

const SEARXNG_URL = (process.env.SEARXNG_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "")

export interface SearchHit {
  url: string
  title: string
  snippet: string
  engine?: string
  score?: number
}

export interface SearchOptions {
  /** Up to N results. Default 10. */
  limit?: number
  /** Per-request timeout (ms). Default 8s. */
  timeoutMs?: number
  /** Limit to a single category — see SearXNG docs. */
  categories?: ("general" | "images" | "news" | "social media")[]
  /** Restrict to a specific language (ISO-2). */
  lang?: string
  /** Optional time range (day / week / month / year). */
  timeRange?: "day" | "week" | "month" | "year"
}

/** True if SearXNG is reachable at the configured URL. */
export async function isSearxngAvailable(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${SEARXNG_URL}/healthz`, { signal: ctrl.signal })
    clearTimeout(t)
    return res.ok
  } catch { return false }
}

export async function search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  if (!query.trim()) return []
  const cap = Math.max(1, Math.min(50, opts.limit ?? 10))
  const params = new URLSearchParams({ q: query, format: "json" })
  if (opts.categories?.length) params.set("categories", opts.categories.join(","))
  if (opts.lang) params.set("language", opts.lang)
  if (opts.timeRange) params.set("time_range", opts.timeRange)

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 8000)
  try {
    const res = await fetch(`${SEARXNG_URL}/search?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: ctrl.signal,
    })
    if (!res.ok) return []
    const json = (await res.json()) as { results?: any[] }
    const out: SearchHit[] = []
    for (const r of (json?.results ?? []).slice(0, cap)) {
      if (!r?.url) continue
      out.push({
        url: String(r.url),
        title: String(r.title ?? r.url),
        snippet: String(r.content ?? ""),
        engine: typeof r.engine === "string" ? r.engine : undefined,
        score: typeof r.score === "number" ? r.score : undefined,
      })
    }
    return out
  } catch {
    return []
  } finally {
    clearTimeout(timer)
  }
}

/** Convenience: find the most-likely homepage for a firm name. */
export async function findFirmHomepage(name: string): Promise<string | null> {
  const hits = await search(`${name} venture capital`, { limit: 5, categories: ["general"] })
  if (!hits.length) return null
  // Prefer hits whose hostname looks like the firm slug.
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "")
  const ranked = hits.map((h) => {
    let bonus = 0
    try {
      const host = new URL(h.url).hostname.toLowerCase().replace(/^www\./, "")
      if (host.replace(/[^a-z0-9]+/g, "").startsWith(slug.slice(0, 8))) bonus += 0.4
      if (/(\.vc|\.fund|\.capital|\.ventures)$/i.test(host)) bonus += 0.1
      if (/linkedin|crunchbase|wikipedia|twitter|x\.com|facebook/.test(host)) bonus -= 0.3
    } catch {}
    return { ...h, rank: (h.score ?? 0) + bonus }
  }).sort((a, b) => b.rank - a.rank)
  return ranked[0]?.url ?? null
}
