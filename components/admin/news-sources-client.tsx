"use client"

/**
 * Interactive news-sources picker.
 *
 * Layout
 *   - Top toolbar: region selector + topic chips (multi-select) +
 *     provider toggles + Fetch button
 *   - Provider status strip showing per-provider ok/error counts after
 *     each fetch
 *   - Results: cards with title, source, time, sentiment chip, topics,
 *     and a "Draft article from this →" button that POSTs the seed
 *     to the existing /api/admin/newsroom/draft endpoint
 *
 * The "Draft from this" path constructs a richer topic prompt than the
 * plain text box: it includes the headline, source, summary, and URL so
 * the AI draft has concrete grounding instead of having to invent details.
 */

import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, RefreshCcw, Loader2, Globe, MapPin, AlertTriangle,
  CheckCircle2, ExternalLink, Sparkles, Search, X, Filter, KeyRound,
} from "lucide-react"

interface ProviderStatus {
  id: string
  label: string
  available: boolean
  requires?: string
}
interface RegionDef { id: string; label: string; description: string; countryCodes: string[] }
interface TopicDef { id: string; label: string }

interface Props {
  providers: ProviderStatus[]
  regions: RegionDef[]
  topics: TopicDef[]
}

interface NewsItem {
  id: string
  title: string
  url: string
  summary: string | null
  source: string
  publishedAt: string | null
  region: string | null
  topics: string[]
  sentiment: number | null
  provider: string
  /** Lead image from the source article when the provider returned one. */
  imageUrl: string | null
}

interface ProviderResult {
  provider: string
  ok: boolean
  count: number
  error?: string
}

const SENT_TONE = (n: number | null) =>
  n == null               ? "text-muted-foreground"
  : n >  0.15             ? "text-emerald-600"
  : n < -0.15             ? "text-rose-600"
  : "text-muted-foreground"

export function NewsSourcesClient({ providers, regions, topics }: Props) {
  const router = useRouter()
  const [region, setRegion] = useState<string>("global")
  const [selectedTopics, setSelectedTopics] = useState<string[]>(["venture_capital", "ipo", "fundraising"])
  const [selectedProviders, setSelectedProviders] = useState<string[]>(
    providers.filter((p) => p.available).map((p) => p.id),
  )
  const [items, setItems] = useState<NewsItem[]>([])
  const [providerResults, setProviderResults] = useState<ProviderResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [draftingId, setDraftingId] = useState<string | null>(null)

  function toggle(arr: string[], id: string): string[] {
    return arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]
  }

  async function fetchNews() {
    setBusy(true); setError(null); setProviderResults([])
    try {
      const res = await fetch("/api/admin/news/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region,
          topics: selectedTopics,
          providers: selectedProviders,
          limit: 60,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Fetch failed (${res.status})`)
      setItems(data.items ?? [])
      setProviderResults(data.providerResults ?? [])
      if (data.error) setError(data.error)
    } catch (e: any) { setError(e?.message ?? "Fetch failed") }
    finally { setBusy(false) }
  }

  // Auto-fetch on mount with the default selections.
  useEffect(() => {
    fetchNews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => {
      const blob = `${it.title} ${it.summary ?? ""} ${it.source}`.toLowerCase()
      return blob.includes(q)
    })
  }, [items, query])

  async function draftFrom(item: NewsItem) {
    setDraftingId(item.id); setError(null)
    try {
      // Build a richer topic seed than the plain editor box — give the
      // model concrete facts so it doesn't invent unrelated context.
      const seed = [
        `Source: ${item.source}`,
        item.publishedAt ? `Published: ${new Date(item.publishedAt).toISOString().slice(0, 10)}` : null,
        `Headline: ${item.title}`,
        item.summary ? `Summary: ${item.summary}` : null,
        `URL: ${item.url}`,
        "",
        `Write the newsroom article analyzing this story for a VC / private-markets audience. Use the headline as the launchpad; explain why it matters for funds, founders, and LPs; cite the source inline as (${item.source}, ${item.publishedAt ? new Date(item.publishedAt).getUTCFullYear() : new Date().getUTCFullYear()}).`,
      ].filter(Boolean).join("\n")

      const res = await fetch("/api/admin/newsroom/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: seed, blogType: "Analysis" }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Draft failed (${res.status})`)
      // Store the draft fields in sessionStorage so the editor page can
      // pick them up — same one-shot pattern the existing AI Draft button
      // uses, just from outside the editor.
      sessionStorage.setItem("newsroom:draft-from-source", JSON.stringify({
        headline: data.headline,
        subheadline: data.subheadline,
        content: data.content,
        suggestedTags: data.suggestedTags,
        sourceUrl: item.url,
        sourceName: item.source,
        sourceDate: item.publishedAt,
        // Pass the lead image so the editor pre-fills image_url. The
        // user can swap or remove from there before publishing.
        imageUrl: item.imageUrl ?? null,
      }))
      router.push("/dashboard/admin/newsroom/new?from-source=1")
    } catch (e: any) { setError(e?.message ?? "Draft failed") }
    finally { setDraftingId(null) }
  }

  const haveAnyAvailable = providers.some((p) => p.available)

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-6">
      <div>
        <Link href="/dashboard/admin/newsroom" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-3.5 h-3.5" /> Newsroom
        </Link>
        <div className="mt-3 flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-display text-3xl md:text-4xl tracking-tight">News sources</h1>
            <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
              Pull real-time stories from the configured providers, filter by region + topic, then seed an AI draft from any headline.
            </p>
          </div>
          <Link href="/dashboard/admin/newsroom/api-keys"
            className="inline-flex items-center gap-2 h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5">
            <KeyRound className="w-4 h-4" /> API keys
          </Link>
          <button type="button" onClick={fetchNews} disabled={busy}
            className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
            Fetch latest
          </button>
        </div>
      </div>

      {!haveAnyAvailable && (
        <div className="border border-amber-500/30 bg-amber-500/5 rounded-md px-4 py-3 text-xs text-amber-700">
          <AlertTriangle className="w-3 h-3 inline mr-1" />
          No paid news providers are configured. SEC EDGAR and Hacker News still work without keys; set
          <span className="font-mono mx-1">ALPHA_VANTAGE_API_KEY</span>,
          <span className="font-mono mx-1">FINNHUB_API_KEY</span>, or
          <span className="font-mono mx-1">MARKETAUX_API_KEY</span>
          in your env to enable the rest.
        </div>
      )}

      {/* Region selector */}
      <section className="border border-foreground/10 rounded-md p-4 space-y-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
          <Globe className="w-3 h-3" /> Region
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {regions.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRegion(r.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border transition-colors ${
                region === r.id
                  ? "bg-foreground text-background border-foreground"
                  : "border-foreground/15 hover:border-foreground/40"
              }`}
              title={r.description}
            >
              {r.id === "global" && <Globe className="w-3 h-3" />}
              {r.id !== "global" && <MapPin className="w-3 h-3" />}
              {r.label}
              {r.countryCodes.length > 0 && (
                <span className="text-[10px] opacity-70">· {r.countryCodes.length}</span>
              )}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {regions.find((r) => r.id === region)?.description}
        </div>
      </section>

      {/* Topic chips */}
      <section className="border border-foreground/10 rounded-md p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground inline-flex items-center gap-1">
            <Filter className="w-3 h-3" /> Topics
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            {selectedTopics.length} selected
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {topics.map((t) => {
            const active = selectedTopics.includes(t.id)
            return (
              <button key={t.id} type="button"
                onClick={() => setSelectedTopics(toggle(selectedTopics, t.id))}
                className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                  active
                    ? "bg-foreground/10 border-foreground/30 text-foreground"
                    : "border-foreground/10 text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                }`}>
                {t.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* Provider toggles */}
      <section className="border border-foreground/10 rounded-md p-4 space-y-3">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Providers</div>
        <div className="flex items-center gap-2 flex-wrap">
          {providers.map((p) => {
            const active = selectedProviders.includes(p.id)
            const status = providerResults.find((r) => r.provider === p.id)
            return (
              <button key={p.id} type="button"
                disabled={!p.available}
                onClick={() => setSelectedProviders(toggle(selectedProviders, p.id))}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-md border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  active && p.available
                    ? "bg-foreground text-background border-foreground"
                    : "border-foreground/15 hover:border-foreground/40"
                }`}
                title={p.available ? p.label : `Set ${p.requires} to enable`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${
                  status?.ok ? "bg-emerald-500"
                  : status && !status.ok ? "bg-rose-500"
                  : p.available ? "bg-foreground/40"
                  : "bg-foreground/20"
                }`} />
                {p.label}
                {status?.ok && <span className="text-[10px] opacity-70">· {status.count}</span>}
                {status?.error && <span className="text-[10px] opacity-70">· err</span>}
                {!p.available && <span className="text-[10px] opacity-70">· {p.requires}</span>}
              </button>
            )
          })}
        </div>
        {/* Per-provider errors after a fetch */}
        {providerResults.some((r) => r.error) && (
          <div className="space-y-1 pt-2 border-t border-foreground/10">
            {providerResults.filter((r) => r.error).map((r) => (
              <div key={r.provider} className="text-[11px] font-mono text-rose-600">
                {r.provider}: {r.error}
              </div>
            ))}
          </div>
        )}
      </section>

      {error && (
        <div className="px-3 py-2 text-xs font-mono text-rose-600 border border-rose-500/30 bg-rose-500/5 rounded-md inline-flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      )}

      {/* Search bar over results */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter results by keyword…"
            className="w-full h-9 pl-8 pr-3 text-sm border border-foreground/15 rounded-md bg-background" />
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {filtered.length}/{items.length}
        </span>
      </div>

      {/* Results */}
      <div className="space-y-3">
        {busy && items.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin inline mr-2" /> Fetching from providers…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? "No stories returned. Adjust topics + providers and re-fetch."
              : "No results match your filter."}
          </div>
        ) : filtered.map((item) => (
          <NewsCard
            key={item.id}
            item={item}
            onDraft={() => draftFrom(item)}
            drafting={draftingId === item.id}
          />
        ))}
      </div>
    </div>
  )
}

function NewsCard({
  item, onDraft, drafting,
}: { item: NewsItem; onDraft: () => void; drafting: boolean }) {
  const ago = relativeTime(item.publishedAt)
  return (
    <article className="border border-foreground/10 rounded-md p-4 bg-background hover:bg-foreground/[0.02] group">
      <div className="flex items-start gap-3">
        {/* Lead image thumbnail when the provider returned one. Falls back
            to a placeholder tile so layout stays consistent. The img tag
            uses onError to hide itself on 404/CORS rejection rather than
            leaving a broken-image icon. */}
        {item.imageUrl ? (
          <a href={item.url} target="_blank" rel="noreferrer"
            className="block w-24 h-24 md:w-32 md:h-24 shrink-0 rounded-md overflow-hidden border border-foreground/10 bg-foreground/5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.currentTarget.parentElement as HTMLElement).style.display = "none"
              }}
            />
          </a>
        ) : null}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
            <span className="text-foreground/70">{item.source}</span>
            {ago && <span>· {ago}</span>}
            {item.region && <span>· {item.region.toUpperCase()}</span>}
            {item.sentiment != null && (
              <span className={SENT_TONE(item.sentiment)}>
                · sentiment {item.sentiment.toFixed(2)}
              </span>
            )}
            {item.imageUrl && (
              <span className="text-emerald-700">· image</span>
            )}
            <span className="ml-auto px-1.5 py-0.5 rounded border border-foreground/10 text-foreground/60">
              {item.provider}
            </span>
          </div>
          <a href={item.url} target="_blank" rel="noreferrer"
            className="block font-display text-base md:text-lg leading-snug text-foreground hover:underline">
            {item.title}
            <ExternalLink className="w-3 h-3 inline ml-1 opacity-60" />
          </a>
          {item.summary && (
            <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{item.summary}</p>
          )}
          {item.topics.length > 0 && (
            <div className="mt-2 flex items-center gap-1 flex-wrap">
              {item.topics.slice(0, 6).map((t, i) => (
                <span key={`${t}-${i}`} className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border border-foreground/10 px-1.5 py-0.5 rounded">
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={onDraft} disabled={drafting}
          className="inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 shrink-0">
          {drafting
            ? <><Loader2 className="w-3 h-3 animate-spin" /> Drafting…</>
            : <><Sparkles className="w-3 h-3" /> Draft article</>}
        </button>
      </div>
    </article>
  )
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (isNaN(t)) return null
  const diff = Date.now() - t
  const min = 60_000, h = 3600_000, d = 86_400_000
  if (diff < h) return `${Math.max(1, Math.round(diff / min))}m ago`
  if (diff < d) return `${Math.round(diff / h)}h ago`
  if (diff < 30 * d) return `${Math.round(diff / d)}d ago`
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
