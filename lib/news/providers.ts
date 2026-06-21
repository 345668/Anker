/**
 * News provider modules — one fetch() per source, returning a canonical
 * NewsItem shape so the merged feed can rank/dedupe across providers.
 *
 * Providers
 *   alphaVantage  — NEWS_SENTIMENT (global feed, topic filter, sentiment scores)
 *   finnhub       — /news?category=general, /ipo-calendar (free-tier IPO dates)
 *   marketaux     — /news/all?countries=…&filter_entities=true (strong region story)
 *   secEdgar      — recent S-1 / S-1/A filings, the highest-signal IPO source (free, no key)
 *   hackernews    — Algolia HN search, free, decent VC/startup signal when filtered
 *
 * Each provider exports:
 *   - id, label (UI)
 *   - isAvailable()             — checks env / always returns boolean
 *   - fetch(opts) → NewsItem[]  — best-effort; errors throw NewsProviderError
 *
 * All fetches have a hard 10s timeout so a slow provider doesn't hang
 * the merged feed.
 */

import type { Region, Topic } from "@/lib/news/regions"
import { REGION_META } from "@/lib/news/regions"

// ── canonical item shape ────────────────────────────────────────────────

export interface NewsItem {
  id: string
  title: string
  /** Article URL (the user clicks this). */
  url: string
  /** Optional summary / lede. */
  summary: string | null
  /** Source name as the provider reports it ("Bloomberg", "Reuters"…). */
  source: string
  /** ISO timestamp; falsey means the provider didn't return one. */
  publishedAt: string | null
  /** Country code or region tag, when the provider attaches one. */
  region: string | null
  /** Topics the provider tagged the item with — normalised lower-case. */
  topics: string[]
  /** Sentiment score in [-1, 1] when the provider returns one. */
  sentiment: number | null
  /** Which provider produced this row — used to dedupe across providers. */
  provider: string
  /** Raw payload preserved for the AI-draft seed prompt. */
  raw: Record<string, any>
}

export class NewsProviderError extends Error {
  constructor(public provider: string, message: string, public status?: number) {
    super(`[${provider}] ${message}`)
  }
}

export interface FetchOpts {
  region: Region
  topics: Topic[]
  /** Soft cap; providers may return fewer. */
  limit?: number
}

// ── timeout-wrapped fetch helper ────────────────────────────────────────

async function timedFetch(url: string, init: RequestInit = {}, ms = 10_000): Promise<Response> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

// ── topic → provider-specific keyword mappings ──────────────────────────

/** Alpha Vantage topic vocabulary (their taxonomy, not ours). */
const AV_TOPIC: Partial<Record<Topic, string>> = {
  venture_capital:          "private_equity",
  private_equity:           "private_equity",
  ipo:                      "ipo",
  mergers_and_acquisitions: "mergers_and_acquisitions",
  fundraising:              "private_equity",
  exits:                    "mergers_and_acquisitions",
  growth_rounds:            "private_equity",
  ai_infrastructure:        "technology",
  fintech:                  "financial_markets",
  climate_tech:             "energy_transportation",
  healthtech:               "life_sciences",
  earnings:                 "earnings",
  regulation:               "financial_markets",
  macro:                    "economy_macro",
}

/** Free-text search keywords we pass to keyword-search providers. */
const TOPIC_KEYWORDS: Record<Topic, string[]> = {
  venture_capital:          ["venture capital", "VC funding", "Series A", "Series B", "seed round"],
  private_equity:           ["private equity", "buyout", "LBO"],
  ipo:                      ["IPO", "initial public offering", "going public", "S-1 filing"],
  mergers_and_acquisitions: ["M&A", "acquisition", "merger", "takeover"],
  fundraising:              ["raises", "closes round", "funding round", "Series"],
  exits:                    ["exits", "secondary sale", "acquired by"],
  growth_rounds:            ["Series C", "Series D", "growth round", "late stage"],
  ai_infrastructure:        ["AI infrastructure", "GPU", "foundation model", "AI chip"],
  fintech:                  ["fintech", "neobank", "payments", "BNPL"],
  climate_tech:             ["climate tech", "carbon capture", "battery", "EV"],
  healthtech:               ["biotech", "FDA approval", "drug discovery", "digital health"],
  earnings:                 ["earnings", "Q1", "Q2", "Q3", "Q4 results"],
  regulation:               ["SEC", "regulator", "antitrust", "GDPR"],
  macro:                    ["inflation", "Fed", "rate cut", "yield curve"],
}

// ── Alpha Vantage ───────────────────────────────────────────────────────

export const alphaVantage = {
  id: "alpha-vantage",
  label: "Alpha Vantage",
  isAvailable: () => !!process.env.ALPHA_VANTAGE_API_KEY,
  async fetch(opts: FetchOpts): Promise<NewsItem[]> {
    const key = process.env.ALPHA_VANTAGE_API_KEY
    if (!key) throw new NewsProviderError("alpha-vantage", "ALPHA_VANTAGE_API_KEY missing")
    // AV is a single global feed — region filter is best-effort via topics.
    const topics = Array.from(new Set(
      opts.topics.map((t) => AV_TOPIC[t]).filter(Boolean) as string[],
    )).join(",")
    const params = new URLSearchParams({
      function: "NEWS_SENTIMENT",
      apikey: key,
      limit: String(Math.min(opts.limit ?? 50, 1000)),
      sort: "LATEST",
    })
    if (topics) params.set("topics", topics)
    const url = `https://www.alphavantage.co/query?${params}`
    const res = await timedFetch(url)
    if (!res.ok) throw new NewsProviderError("alpha-vantage", `HTTP ${res.status}`, res.status)
    const data = await res.json().catch(() => ({}))
    if (data?.Note) throw new NewsProviderError("alpha-vantage", `rate-limited: ${data.Note}`)
    const feed: any[] = Array.isArray(data?.feed) ? data.feed : []
    return feed.map((a: any) => ({
      id: `av:${hashId(a.url ?? a.title)}`,
      title: String(a.title ?? "").trim(),
      url: a.url,
      summary: a.summary ?? null,
      source: a.source ?? "Alpha Vantage",
      publishedAt: avTime(a.time_published),
      region: null,
      topics: Array.isArray(a.topics)
        ? a.topics.map((t: any) => String(t?.topic ?? "").toLowerCase()).filter(Boolean)
        : [],
      sentiment: typeof a.overall_sentiment_score === "number" ? a.overall_sentiment_score : null,
      provider: "alpha-vantage",
      raw: a,
    })).filter((x: NewsItem) => x.title && x.url)
  },
}

function avTime(s: string | undefined): string | null {
  // AV uses YYYYMMDDTHHMMSS — convert to ISO.
  if (!s || s.length < 15) return null
  const Y = s.slice(0, 4), M = s.slice(4, 6), D = s.slice(6, 8)
  const h = s.slice(9, 11), m = s.slice(11, 13), sec = s.slice(13, 15)
  const iso = `${Y}-${M}-${D}T${h}:${m}:${sec}Z`
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d.toISOString()
}

// ── Finnhub ─────────────────────────────────────────────────────────────

export const finnhub = {
  id: "finnhub",
  label: "Finnhub",
  isAvailable: () => !!process.env.FINNHUB_API_KEY,
  async fetch(opts: FetchOpts): Promise<NewsItem[]> {
    const key = process.env.FINNHUB_API_KEY
    if (!key) throw new NewsProviderError("finnhub", "FINNHUB_API_KEY missing")
    // Choose endpoint by topic — IPOs get the calendar endpoint, everything
    // else gets the general news feed.
    const wantsIpo = opts.topics.includes("ipo")
    const wantsMa = opts.topics.includes("mergers_and_acquisitions") || opts.topics.includes("exits")
    const out: NewsItem[] = []

    if (wantsMa || opts.topics.length === 0 || !wantsIpo) {
      const url = `https://finnhub.io/api/v1/news?category=${wantsMa ? "merger" : "general"}&token=${key}`
      const res = await timedFetch(url)
      if (!res.ok) throw new NewsProviderError("finnhub", `HTTP ${res.status}`, res.status)
      const arr: any[] = await res.json().catch(() => [])
      if (Array.isArray(arr)) {
        for (const a of arr.slice(0, opts.limit ?? 50)) {
          out.push({
            id: `fh:${a.id ?? hashId(a.url ?? a.headline)}`,
            title: String(a.headline ?? "").trim(),
            url: a.url,
            summary: a.summary ?? null,
            source: a.source ?? "Finnhub",
            publishedAt: a.datetime ? new Date(Number(a.datetime) * 1000).toISOString() : null,
            region: null,
            topics: [String(a.category ?? "").toLowerCase()].filter(Boolean),
            sentiment: null,
            provider: "finnhub",
            raw: a,
          })
        }
      }
    }
    if (wantsIpo) {
      const today = new Date()
      const inMonth = new Date(Date.now() + 31 * 24 * 3600 * 1000)
      const from = today.toISOString().slice(0, 10)
      const to = inMonth.toISOString().slice(0, 10)
      const url = `https://finnhub.io/api/v1/calendar/ipo?from=${from}&to=${to}&token=${key}`
      const res = await timedFetch(url)
      if (res.ok) {
        const data: any = await res.json().catch(() => ({}))
        const list: any[] = Array.isArray(data?.ipoCalendar) ? data.ipoCalendar : []
        for (const ipo of list) {
          out.push({
            id: `fh-ipo:${ipo.symbol ?? hashId(ipo.name)}`,
            title: `${ipo.name} (${ipo.symbol ?? "—"}) — IPO ${ipo.date} · ${ipo.exchange ?? ""}`,
            url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(ipo.name ?? "")}&type=S-1&dateb=&owner=include&count=10`,
            summary: ipo.numberOfShares
              ? `${ipo.numberOfShares.toLocaleString()} shares at ${ipo.priceRangeLow ?? "?"}-${ipo.priceRangeHigh ?? "?"} — total value $${ipo.totalSharesValue ?? "?"}`
              : null,
            source: "Finnhub IPO calendar",
            publishedAt: ipo.date ? new Date(ipo.date).toISOString() : null,
            region: null,
            topics: ["ipo"],
            sentiment: null,
            provider: "finnhub",
            raw: ipo,
          })
        }
      }
    }
    return out
  },
}

// ── Marketaux ───────────────────────────────────────────────────────────

export const marketaux = {
  id: "marketaux",
  label: "Marketaux",
  isAvailable: () => !!process.env.MARKETAUX_API_KEY,
  async fetch(opts: FetchOpts): Promise<NewsItem[]> {
    const key = process.env.MARKETAUX_API_KEY
    if (!key) throw new NewsProviderError("marketaux", "MARKETAUX_API_KEY missing")
    const params = new URLSearchParams({
      api_token: key,
      language: "en",
      limit: String(Math.min(opts.limit ?? 50, 100)),
      sort: "published_desc",
    })
    const meta = REGION_META[opts.region]
    if (meta.countryCodes.length) params.set("countries", meta.countryCodes.join(","))
    // Keyword search across topics.
    const kw = opts.topics
      .flatMap((t) => TOPIC_KEYWORDS[t] ?? [])
      .slice(0, 6)
      .map((k) => `"${k}"`)
      .join(" | ")
    if (kw) params.set("search", kw)
    const url = `https://api.marketaux.com/v1/news/all?${params}`
    const res = await timedFetch(url)
    if (!res.ok) throw new NewsProviderError("marketaux", `HTTP ${res.status}`, res.status)
    const data: any = await res.json().catch(() => ({}))
    const arr: any[] = Array.isArray(data?.data) ? data.data : []
    return arr.map((a: any) => ({
      id: `mx:${a.uuid ?? hashId(a.url ?? a.title)}`,
      title: String(a.title ?? "").trim(),
      url: a.url,
      summary: a.description ?? null,
      source: a.source ?? "Marketaux",
      publishedAt: a.published_at ?? null,
      region: Array.isArray(a.countries) && a.countries.length ? String(a.countries[0]).toLowerCase() : null,
      topics: [
        ...(Array.isArray(a.industries) ? a.industries.map((s: any) => String(s).toLowerCase()) : []),
        ...(Array.isArray(a.entities) ? a.entities.map((e: any) => `entity:${String(e?.symbol ?? "").toLowerCase()}`) : []),
      ].filter(Boolean),
      sentiment: typeof a.sentiment_score === "number" ? a.sentiment_score : null,
      provider: "marketaux",
      raw: a,
    })).filter((x: NewsItem) => x.title && x.url)
  },
}

// ── SEC EDGAR (no key required) ─────────────────────────────────────────

export const secEdgar = {
  id: "sec-edgar",
  label: "SEC EDGAR (IPO filings)",
  /** Always available — public API, no key. We require a UA contact email. */
  isAvailable: () => true,
  async fetch(opts: FetchOpts): Promise<NewsItem[]> {
    if (!opts.topics.includes("ipo")) return []
    // SEC requires a "User-Agent: Name email" header. Use OUTREACH_FROM_EMAIL
    // as the contact email so the GP's identity is preserved.
    const ua = `Anker Newsroom (${process.env.OUTREACH_FROM_EMAIL ?? "vc@an-ker.de"})`
    const url = `https://efts.sec.gov/LATEST/search-index?q=%22initial+public+offering%22&dateRange=custom&startdt=${last7Days()}&enddt=${today()}&forms=S-1,S-1%2FA,F-1,424B4`
    const res = await timedFetch(url, { headers: { "User-Agent": ua, "Accept": "application/json" } })
    if (!res.ok) throw new NewsProviderError("sec-edgar", `HTTP ${res.status}`, res.status)
    const data: any = await res.json().catch(() => ({}))
    const hits: any[] = data?.hits?.hits ?? []
    return hits.slice(0, opts.limit ?? 50).map((h: any) => {
      const src = h._source ?? {}
      const cik = src.ciks?.[0]
      const accession = src.adsh ?? ""
      const accessionNoDashes = accession.replace(/-/g, "")
      const archiveUrl = cik && accession
        ? `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${src.form ?? "S-1"}&dateb=&owner=include&count=10`
        : `https://www.sec.gov/`
      return {
        id: `sec:${accession || hashId(src.display_names?.[0] + (src.form ?? ""))}`,
        title: `${src.display_names?.[0] ?? "Filer"} — ${src.form ?? "?"} filed ${src.file_date ?? ""}`,
        url: archiveUrl,
        summary: src.file_description || null,
        source: "SEC EDGAR",
        publishedAt: src.file_date ? new Date(src.file_date).toISOString() : null,
        region: "us",
        topics: ["ipo"],
        sentiment: null,
        provider: "sec-edgar",
        raw: h,
      } as NewsItem
    }).filter((x) => x.title)
  },
}

function today() { return new Date().toISOString().slice(0, 10) }
function last7Days() { return new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10) }

// ── Hacker News (Algolia) — no key, great VC / startup signal ───────────

export const hackerNews = {
  id: "hacker-news",
  label: "Hacker News",
  isAvailable: () => true,
  async fetch(opts: FetchOpts): Promise<NewsItem[]> {
    // Search the front-page-popular items for keywords. HN is global; we
    // can't region-filter so we just return everything for non-`global` too.
    const kw = opts.topics
      .flatMap((t) => TOPIC_KEYWORDS[t] ?? [])
      .slice(0, 4)
      .join(" OR ")
    const q = kw || "startup OR fundraise OR IPO OR acquisition"
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(q)}&tags=story&hitsPerPage=${Math.min(opts.limit ?? 30, 50)}`
    const res = await timedFetch(url)
    if (!res.ok) throw new NewsProviderError("hacker-news", `HTTP ${res.status}`, res.status)
    const data: any = await res.json().catch(() => ({}))
    const hits: any[] = data?.hits ?? []
    return hits.map((h: any) => ({
      id: `hn:${h.objectID}`,
      title: String(h.title ?? "").trim(),
      url: h.url ?? `https://news.ycombinator.com/item?id=${h.objectID}`,
      summary: h.story_text ? stripHtml(h.story_text).slice(0, 280) : null,
      source: "Hacker News",
      publishedAt: h.created_at ?? null,
      region: null,
      topics: Array.isArray(h._tags) ? h._tags.filter((t: string) => !t.startsWith("author_") && !t.startsWith("story")).map((s: string) => s.toLowerCase()) : [],
      sentiment: null,
      provider: "hacker-news",
      raw: h,
    })).filter((x: NewsItem) => x.title && x.url)
  },
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
}

// ── registry ────────────────────────────────────────────────────────────

export const PROVIDERS = [alphaVantage, finnhub, marketaux, secEdgar, hackerNews] as const
export type ProviderId = (typeof PROVIDERS)[number]["id"]

export interface ProviderStatus {
  id: ProviderId
  label: string
  available: boolean
  requires?: string
}

export function listProviders(): ProviderStatus[] {
  return [
    { id: "alpha-vantage", label: alphaVantage.label, available: alphaVantage.isAvailable(), requires: "ALPHA_VANTAGE_API_KEY" },
    { id: "finnhub",       label: finnhub.label,      available: finnhub.isAvailable(),      requires: "FINNHUB_API_KEY" },
    { id: "marketaux",     label: marketaux.label,    available: marketaux.isAvailable(),    requires: "MARKETAUX_API_KEY" },
    { id: "sec-edgar",     label: secEdgar.label,     available: true },
    { id: "hacker-news",   label: hackerNews.label,   available: true },
  ]
}

export function providerById(id: ProviderId) {
  switch (id) {
    case "alpha-vantage": return alphaVantage
    case "finnhub":       return finnhub
    case "marketaux":     return marketaux
    case "sec-edgar":     return secEdgar
    case "hacker-news":   return hackerNews
    default:              return null
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

function hashId(s: string | undefined): string {
  if (!s) return Math.random().toString(36).slice(2, 12)
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}

// ── merge + dedupe ──────────────────────────────────────────────────────

/**
 * Dedupe across providers by URL (host+path, ignoring query strings) and
 * by canonicalised title. Returns the freshest sample of each cluster
 * with the highest-signal source listed first.
 */
export function dedupeAndRank(items: NewsItem[]): NewsItem[] {
  const seen = new Map<string, NewsItem>()
  for (const it of items) {
    const urlKey = canonicalUrl(it.url)
    const titleKey = it.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 120)
    const key = urlKey || titleKey
    if (!key) continue
    const existing = seen.get(key)
    if (!existing) {
      seen.set(key, it)
    } else {
      // Prefer the one with a real publishedAt; tiebreak: the more verbose summary.
      const existingScore = (existing.publishedAt ? 2 : 0) + (existing.summary ? 1 : 0)
      const newScore      = (it.publishedAt ? 2 : 0) + (it.summary ? 1 : 0)
      if (newScore > existingScore) seen.set(key, it)
    }
  }
  return Array.from(seen.values()).sort((a, b) => {
    // Newest first; nulls last.
    if (!a.publishedAt && !b.publishedAt) return 0
    if (!a.publishedAt) return 1
    if (!b.publishedAt) return -1
    return a.publishedAt > b.publishedAt ? -1 : 1
  })
}

function canonicalUrl(u: string): string {
  try {
    const url = new URL(u)
    return `${url.hostname}${url.pathname}`.toLowerCase().replace(/\/$/, "")
  } catch { return u }
}
