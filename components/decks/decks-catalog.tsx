"use client"

/**
 * DecksCatalog — Grid of Figma templates with search, filter, classify.
 *
 * Card actions:
 *   - Preview on Figma (open community URL in new tab)
 *   - Classify (set deck_type via dropdown -> PATCH /api/decks/templates/:id)
 *   - Star as favorite / add to shortlist (PATCH flags)
 *
 * Favorites always render first, then shortlisted, then anything with a
 * proper deck_type, then the unclassified backfill at the bottom.
 */
import { useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import type { DeckTemplate, DeckType } from "@/lib/decks/templates"

interface Props {
  templates: DeckTemplate[]
  counts: Record<DeckType, number>
  activeType: string
  q: string
  only: string
  typeLabels: Record<DeckType, string>
  /** Rendered inside DecksPowerhouse — hide the standalone page header. */
  embedded?: boolean
}

const DECK_TYPES: DeckType[] = ["unclassified","fund_overview","lp_update","pitch_deck","investment_memo","portfolio_review","other"]

export function DecksCatalog({ templates, counts, activeType, q, only, typeLabels, embedded }: Props) {
  const [building, setBuilding] = useState<string | null>(null)
  const router = useRouter()
  const [query, setQuery] = useState(q)
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState(templates)

  const filtered = useMemo(() => {
    const nq = query.trim().toLowerCase()
    if (!nq) return rows
    return rows.filter((r) =>
      (r.name || "").toLowerCase().includes(nq) ||
      r.fileKey.toLowerCase().includes(nq) ||
      typeLabels[r.deckType].toLowerCase().includes(nq)
    )
  }, [rows, query, typeLabels])

  function applyFilter(patch: Record<string, string | undefined>) {
    const url = new URL(window.location.href)
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === "") url.searchParams.delete(k)
      else url.searchParams.set(k, v)
    }
    startTransition(() => router.push(url.pathname + "?" + url.searchParams.toString()))
  }

  async function classify(id: string, deckType: DeckType) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, deckType, classifiedAt: new Date().toISOString() } : r))
    await fetch(`/api/decks/templates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deckType }),
    })
  }
  async function buildDeck(t: DeckTemplate) {
    if (t.deckType === "unclassified") return
    setBuilding(t.id)
    try {
      const r = await fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateId: t.id }),
      })
      const j = await r.json().catch(() => ({}))
      if (r.ok && (j?.id || j?.deck?.id)) router.push(`/dashboard/decks/${j.id ?? j.deck.id}`)
    } finally { setBuilding(null) }
  }

  async function flag(id: string, patch: { shortlisted?: boolean; favorite?: boolean }) {
    setRows((prev) => prev.map((r) => r.id === id ? { ...r, ...patch } : r))
    await fetch(`/api/decks/templates/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    })
  }

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-6">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {!embedded ? (
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Decks</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">Template catalog</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {templates.length} Figma templates. Classify one, then build a deck from your fund context.
            </p>
          </div>
        ) : <div />}
        <div className="flex flex-wrap gap-2">
          {(["all","favorites","shortlisted"] as const).map((k) => (
            <button key={k} onClick={() => applyFilter({ only: k === "all" ? undefined : k })}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${only === k || (k === "all" && !only)
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15 text-foreground hover:bg-foreground/5"}`}>
              {k === "all" ? "All" : k === "favorites" ? "★ Favorites" : "Shortlisted"}
            </button>
          ))}
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input type="search" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, file key, or type…"
          className="flex-1 min-w-[240px] rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm outline-none focus:border-foreground/40" />
        <select value={activeType} onChange={(e) => applyFilter({ type: e.target.value === "all" ? undefined : e.target.value })}
          className="rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm">
          <option value="all">All types · {templates.length}</option>
          {DECK_TYPES.map((t) => (
            <option key={t} value={t}>{typeLabels[t]} · {counts[t] ?? 0}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-foreground/10 bg-background p-12 text-center text-sm text-muted-foreground">
          Nothing matches. Try clearing the filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((t) => (
            <article key={t.id} className="group rounded-xl border border-foreground/10 bg-background overflow-hidden flex flex-col">
              <a href={t.communityUrl} target="_blank" rel="noopener noreferrer"
                 className="block aspect-video bg-gradient-to-br from-slate-800 via-slate-900 to-black relative overflow-hidden">
                {t.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={t.thumbnailUrl} alt={t.name || t.fileKey} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-white/40 text-xs font-mono">
                    #{t.fileKey.slice(-8)}
                  </div>
                )}
                {t.favorite && (
                  <span className="absolute top-2 left-2 rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-950">★ Favorite</span>
                )}
                {!t.favorite && t.shortlisted && (
                  <span className="absolute top-2 left-2 rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-bold uppercase text-white">Shortlisted</span>
                )}
              </a>
              <div className="p-3 flex-1 flex flex-col gap-2">
                <div className="text-sm font-semibold truncate">{t.name || `Template ${t.fileKey.slice(-6)}`}</div>
                <div className="flex flex-wrap items-center gap-1">
                  <select value={t.deckType} onChange={(e) => classify(t.id, e.target.value as DeckType)}
                    className="flex-1 rounded border border-foreground/15 bg-background px-2 py-1 text-xs">
                    {DECK_TYPES.map((k) => <option key={k} value={k}>{typeLabels[k]}</option>)}
                  </select>
                  <button onClick={() => flag(t.id, { favorite: !t.favorite })}
                    className={`rounded px-2 py-1 text-xs ${t.favorite ? "bg-amber-100 text-amber-700" : "border border-foreground/15 hover:bg-foreground/5"}`}
                    title="Favorite">★</button>
                  <button onClick={() => flag(t.id, { shortlisted: !t.shortlisted })}
                    className={`rounded px-2 py-1 text-xs ${t.shortlisted ? "bg-sky-100 text-sky-700" : "border border-foreground/15 hover:bg-foreground/5"}`}
                    title="Shortlist">◎</button>
                </div>
                <div className="mt-auto flex gap-1.5">
                  <button onClick={() => buildDeck(t)}
                    disabled={t.deckType === "unclassified" || building === t.id}
                    title={t.deckType === "unclassified" ? "Classify this template first" : "Start a deck from this template"}
                    className="flex-1 rounded-md bg-foreground text-background px-2 py-1 text-xs font-semibold hover:bg-foreground/90 disabled:opacity-40">
                    {building === t.id ? "Creating…" : "Build deck"}
                  </button>
                  <a href={t.communityUrl} target="_blank" rel="noopener noreferrer"
                     className="rounded-md border border-foreground/15 px-2 py-1 text-center text-xs font-semibold hover:bg-foreground/5">
                    Preview ↗
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {pending && <div className="fixed bottom-4 right-4 rounded-full bg-black/80 px-3 py-1 text-xs text-white">Loading…</div>}
    </div>
  )
}
