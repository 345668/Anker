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
 *   SEARXNG_URL    default: http://127.0.0.1:8080 (development only; set it to use SearXNG elsewhere)
 *   TAVILY_API_KEY / BRAVE_SEARCH_API_KEY / SERPER_API_KEY   optional hosted search
 *   QWEN_WEB_SEARCH=off   turns off the Qwen web search that needs no setup
 *
 * Order: SearXNG (if set), Tavily, Brave, Serper (if keyed), then Qwen search with the platform's Qwen key.
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
  if (!searxngConfigured() && process.env.NODE_ENV === "production") return false
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 1500)
    const res = await fetch(`${SEARXNG_URL}/healthz`, { signal: ctrl.signal })
    clearTimeout(t)
    return res.ok
  } catch { return false }
}

/** What one provider did, for an honest "why there were no results". Never contains keys. */
export interface ProviderAttempt { provider: string; ok: boolean; note?: string }

type Provider = { name: string; run: (query: string, opts: SearchOptions) => Promise<SearchHit[]> }

const clipText = (v: unknown, n = 400) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n)

async function withTimeout<T>(ms: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try { return await fn(ctrl.signal) } finally { clearTimeout(timer) }
}

/** SearXNG, the self-hosted engine: JSON endpoint of the configured instance. */
const searxng: Provider = {
  name: "searxng",
  async run(query, opts) {
    const cap = Math.max(1, Math.min(50, opts.limit ?? 10))
    const params = new URLSearchParams({ q: query, format: "json" })
    if (opts.categories?.length) params.set("categories", opts.categories.join(","))
    if (opts.lang) params.set("language", opts.lang)
    if (opts.timeRange) params.set("time_range", opts.timeRange)
    return withTimeout(opts.timeoutMs ?? 8000, async (signal) => {
      const res = await fetch(`${SEARXNG_URL}/search?${params.toString()}`, { headers: { Accept: "application/json" }, signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { results?: any[] }
      const out: SearchHit[] = []
      for (const r of (json?.results ?? []).slice(0, cap)) {
        if (!r?.url) continue
        out.push({ url: String(r.url), title: String(r.title ?? r.url), snippet: String(r.content ?? ""), engine: typeof r.engine === "string" ? r.engine : undefined, score: typeof r.score === "number" ? r.score : undefined })
      }
      return out
    })
  },
}

/** Tavily: a search API built for agents. Needs TAVILY_API_KEY. */
const tavily: Provider = {
  name: "tavily",
  async run(query, opts) {
    return withTimeout(opts.timeoutMs ?? 10000, async (signal) => {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST", signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY}` },
        body: JSON.stringify({ query, max_results: Math.min(opts.limit ?? 8, 10), search_depth: "basic" }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { results?: any[] }
      return (json.results ?? []).filter((r) => r?.url).map((r) => ({ url: String(r.url), title: String(r.title ?? r.url), snippet: clipText(r.content), engine: "tavily", score: typeof r.score === "number" ? r.score : undefined }))
    })
  },
}

/** Brave Search API. Needs BRAVE_SEARCH_API_KEY. */
const brave: Provider = {
  name: "brave",
  async run(query, opts) {
    return withTimeout(opts.timeoutMs ?? 10000, async (signal) => {
      const res = await fetch(`https://api.search.brave.com/res/v1/web/search?${new URLSearchParams({ q: query, count: String(Math.min(opts.limit ?? 8, 20)) })}`, {
        signal, headers: { Accept: "application/json", "X-Subscription-Token": String(process.env.BRAVE_SEARCH_API_KEY) },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { web?: { results?: any[] } }
      return (json.web?.results ?? []).filter((r) => r?.url).map((r) => ({ url: String(r.url), title: String(r.title ?? r.url), snippet: clipText(r.description), engine: "brave" }))
    })
  },
}

/** Serper (Google results). Needs SERPER_API_KEY. */
const serper: Provider = {
  name: "serper",
  async run(query, opts) {
    return withTimeout(opts.timeoutMs ?? 10000, async (signal) => {
      const res = await fetch("https://google.serper.dev/search", {
        method: "POST", signal,
        headers: { "Content-Type": "application/json", "X-API-KEY": String(process.env.SERPER_API_KEY) },
        body: JSON.stringify({ q: query, num: Math.min(opts.limit ?? 8, 10) }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = (await res.json()) as { organic?: any[]; answerBox?: any }
      const hits = (json.organic ?? []).filter((r) => r?.link).map((r) => ({ url: String(r.link), title: String(r.title ?? r.link), snippet: clipText(r.snippet), engine: "serper" }))
      const box = json.answerBox?.answer || json.answerBox?.snippet
      return box ? [{ url: hits[0]?.url ?? "https://www.google.com/search?q=" + encodeURIComponent(query), title: "Direct answer", snippet: clipText(box), engine: "serper" }, ...hits] : hits
    })
  },
}

/**
 * Qwen's own web search (DashScope `enable_search`): the model searches, then answers from what it found.
 * It needs nothing beyond the Qwen key the platform already has, which is why it is the default where no
 * search engine is set up. The answer comes back as the first result, with the sources the API reports.
 * Turn it off with QWEN_WEB_SEARCH=off.
 */
const qwenSearch: Provider = {
  name: "qwen-search",
  async run(query, opts) {
    const { standardQwen } = await import("@/lib/ai/qwen-standard")
    const lane = await standardQwen()
    if (!lane) throw new Error("no Qwen key")
    // Search is a per-model feature with its own entitlement: a model the account may not use for it answers
    // 403 or 404, and the next one is tried. The provider's error CODE (never the key) goes in the report.
    const models = [...new Set([process.env.QWEN_SEARCH_MODEL, "qwen-plus", "qwen-flash", "qwen-turbo", "qwen-max"].filter((m): m is string => !!m))]
    let last = "no model tried"
    for (const model of models) {
      const outcome = await withTimeout(opts.timeoutMs ?? 30000, async (signal) => {
        const res = await fetch(`${lane.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST", signal,
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${lane.apiKey}` },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: "Answer from current web search results. Be factual and brief: give the figures, dates and names the results state, and say which sources they came from. If the results do not answer the question, say so." },
              { role: "user", content: query },
            ],
            enable_search: true,
            search_options: { forced_search: true, enable_source: true },
            temperature: 0.2, max_tokens: 700,
          }),
        })
        if (!res.ok) {
          const body: any = await res.json().catch(() => null)
          const code = String(body?.error?.code ?? body?.code ?? "").slice(0, 60)
          const msg = String(body?.error?.message ?? body?.message ?? "").replace(/sk-[A-Za-z0-9_-]+/g, "[key]").slice(0, 90)
          return { error: `${model}: HTTP ${res.status}${code ? ` ${code}` : ""}${msg ? ` — ${msg}` : ""}`, retry: res.status === 403 || res.status === 404 || res.status === 400 }
        }
        return { json: (await res.json()) as any }
      }).catch((e: any) => ({ error: `${model}: ${e?.name === "AbortError" ? "timed out" : e?.message ?? "failed"}`, retry: false }))
      if ("error" in outcome) { last = String(outcome.error); if (outcome.retry) continue; throw new Error(last) }
      const json = outcome.json
      const answer = clipText(json?.choices?.[0]?.message?.content, 1500)
      if (!answer) { last = `${model}: empty answer`; continue }
      const sources: any[] = json?.search_info?.search_results ?? json?.choices?.[0]?.message?.search_info?.search_results ?? []
      const fallbackUrl = "https://duckduckgo.com/?q=" + encodeURIComponent(query)
      const cited = sources.filter((r) => r?.url).slice(0, Math.max(0, (opts.limit ?? 6) - 1))
      return [
        { url: cited[0]?.url ?? fallbackUrl, title: "Web answer (Qwen search)", snippet: answer, engine: "qwen-search" },
        ...cited.map((r) => ({ url: String(r.url), title: String(r.title ?? r.site_name ?? r.url), snippet: clipText(r.snippet ?? r.site_name ?? ""), engine: "qwen-search" })),
      ]
    }
    throw new Error(last)
  },
}

/** True when SEARXNG_URL names a real instance, not just the localhost default no deployment can reach. */
const searxngConfigured = () => !!process.env.SEARXNG_URL?.trim()

/** Providers in the order they are tried: what the operator configured, then the always-available Qwen search. */
export function searchProviders(env: Record<string, string | undefined> = process.env): Provider[] {
  const list: Provider[] = []
  if (env.SEARXNG_URL?.trim()) list.push(searxng)
  if (env.TAVILY_API_KEY) list.push(tavily)
  if (env.BRAVE_SEARCH_API_KEY) list.push(brave)
  if (env.SERPER_API_KEY) list.push(serper)
  if ((env.QWEN_WEB_SEARCH ?? "").toLowerCase() !== "off") list.push(qwenSearch)
  // Local development with the bundled sidecar and nothing else configured.
  if (!list.length && env.NODE_ENV !== "production") list.push(searxng)
  return list
}

/** Search, and say what every provider did, so "no results" can be told apart from "nothing is set up". */
export async function searchWithStatus(query: string, opts: SearchOptions = {}): Promise<{ hits: SearchHit[]; attempts: ProviderAttempt[] }> {
  const attempts: ProviderAttempt[] = []
  if (!query.trim()) return { hits: [], attempts }
  const cap = Math.max(1, Math.min(50, opts.limit ?? 10))
  for (const p of searchProviders()) {
    try {
      const hits = (await p.run(query, opts)).slice(0, cap)
      attempts.push({ provider: p.name, ok: true, note: hits.length ? undefined : "no results" })
      if (hits.length) return { hits, attempts }
    } catch (e: any) {
      attempts.push({ provider: p.name, ok: false, note: String(e?.name === "AbortError" ? "timed out" : e?.message ?? "failed").slice(0, 200) })
    }
  }
  return { hits: [], attempts }
}

export async function search(query: string, opts: SearchOptions = {}): Promise<SearchHit[]> {
  return (await searchWithStatus(query, opts)).hits
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
