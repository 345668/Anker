"use client"

import Link from "next/link"
import { useEffect, useState, useTransition } from "react"
import {
  Plus, Search, Loader2, AlertTriangle, Eye, Pencil, Trash2,
  CheckCircle2, FileText, Archive, Globe,
} from "lucide-react"

type Status = "draft" | "published" | "archived"
type BlogType = "Insights" | "Trends" | "Analysis" | "Guides" | "News" | "Press" | "Investment" | "Announcements"

interface Article {
  id: string
  headline: string
  subheadline: string | null
  author: string
  blog_type: BlogType
  tags: string[]
  status: Status
  published_at: string | null
  updated_at: string
}

const STATUS_TONE: Record<Status, string> = {
  draft:     "bg-foreground/5 text-foreground/70 border border-foreground/15",
  published: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  archived:  "bg-amber-100 text-amber-700 border border-amber-200",
}
const STATUS_ICON: Record<Status, any> = {
  draft: FileText,
  published: CheckCircle2,
  archived: Archive,
}

export function NewsroomList() {
  const [items, setItems] = useState<Article[]>([])
  const [total, setTotal] = useState(0)
  const [loading, startLoad] = useTransition()
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all")
  const [typeFilter, setTypeFilter] = useState<BlogType | "all">("all")
  const [query, setQuery] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  async function load() {
    setError(null)
    startLoad(async () => {
      try {
        const url = new URL("/api/admin/newsroom", window.location.origin)
        if (statusFilter !== "all") url.searchParams.set("status", statusFilter)
        if (typeFilter !== "all") url.searchParams.set("blog_type", typeFilter)
        if (query.trim()) url.searchParams.set("q", query.trim())
        url.searchParams.set("limit", "200")
        const res = await fetch(url.toString())
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`)
        // Defensive: if the API returned an error shape ({error: "..."} with
        // no rows array) we must NOT pass a non-array to setItems, or every
        // subsequent .map() crashes with "c.map is not a function". The
        // underlying cause was the executive_summary/subheadline schema
        // mismatch, now fixed in lib/newsroom/queries.ts — this guard is
        // belt-and-braces for the next time something upstream goes sideways.
        const rowsValue = Array.isArray(data?.rows) ? data.rows : []
        setItems(rowsValue)
        setTotal(typeof data?.total === "number" ? data.total : rowsValue.length)
        if (!Array.isArray(data?.rows)) {
          throw new Error(data?.error ?? "API returned no rows array")
        }
      } catch (e: any) { setError(e?.message ?? "Load failed") }
    })
  }
  useEffect(() => { void load() }, [statusFilter, typeFilter])

  async function setStatus(id: string, status: Status) {
    setBusy(id); setError(null)
    try {
      const res = await fetch(`/api/admin/newsroom/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Failed (${res.status})`)
      await load()
    } catch (e: any) { setError(e?.message ?? "Update failed") }
    finally { setBusy(null) }
  }

  async function remove(id: string) {
    if (!confirm("Delete this article? Cannot be undone.")) return
    setBusy(id); setError(null)
    try {
      const res = await fetch(`/api/admin/newsroom/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Failed (${res.status})`)
      }
      setItems((p) => p.filter((a) => a.id !== id))
      setTotal((n) => n - 1)
    } catch (e: any) { setError(e?.message ?? "Delete failed") }
    finally { setBusy(null) }
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[260px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && load()}
            placeholder="Search headline / subheadline / content…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="h-10 px-3 text-sm border border-foreground/15 rounded-md bg-background"
        >
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          className="h-10 px-3 text-sm border border-foreground/15 rounded-md bg-background"
        >
          <option value="all">All types</option>
          <option value="Insights">Insights</option>
          <option value="Trends">Trends</option>
          <option value="Analysis">Analysis</option>
          <option value="Guides">Guides</option>
          <option value="News">News</option>
          <option value="Press">Press</option>
          <option value="Investment">Investment</option>
          <option value="Announcements">Announcements</option>
        </select>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="px-3 py-2 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50 inline-flex items-center gap-2"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          Search
        </button>
        <Link
          href="/dashboard/admin/newsroom/sources"
          className="ml-auto inline-flex items-center gap-2 px-3 py-2 rounded-md border border-foreground/15 text-sm hover:bg-foreground/5"
        >
          <Globe className="w-4 h-4" /> News sources
        </Link>
        <Link
          href="/dashboard/admin/newsroom/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-sm hover:bg-foreground/90"
        >
          <Plus className="w-4 h-4" /> New article
        </Link>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-md text-xs">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <span className="text-rose-700 dark:text-rose-400">{error}</span>
        </div>
      )}

      {/* List */}
      <div className="border border-foreground/10 rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-foreground/5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
          {total} article{total === 1 ? "" : "s"}
        </div>
        <div className="divide-y divide-foreground/5">
          {items.length === 0 && !loading && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No articles match this filter.
            </div>
          )}
          {items.map((a) => {
            const StatusIcon = STATUS_ICON[a.status]
            return (
              <div key={a.id} className="px-4 py-3 flex items-start gap-3 hover:bg-foreground/[0.02]">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link
                      href={`/dashboard/admin/newsroom/${a.id}`}
                      className="font-medium text-sm truncate hover:underline"
                    >
                      {a.headline}
                    </Link>
                    <span className={`text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded inline-flex items-center gap-1 ${STATUS_TONE[a.status]}`}>
                      <StatusIcon className="w-3 h-3" /> {a.status}
                    </span>
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-foreground/5">
                      {a.blog_type}
                    </span>
                  </div>
                  {a.subheadline && (
                    <div className="text-[12px] text-muted-foreground line-clamp-1 mt-0.5">{a.subheadline}</div>
                  )}
                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                    {a.author}
                    {a.published_at && ` · published ${new Date(a.published_at).toLocaleDateString()}`}
                    {!a.published_at && ` · updated ${new Date(a.updated_at).toLocaleDateString()}`}
                    {Array.isArray(a.tags) && a.tags.length > 0 && ` · ${a.tags.slice(0, 4).join(", ")}`}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {a.status === "published" && (
                    // Prefer slug to avoid the UUID → slug 308 hop. Disable
                    // prefetch since the link opens in a new tab — the
                    // prefetched UUID URL was throwing 404s in the console
                    // whenever its lookup raced with the publish write.
                    <Link
                      href={`/newsroom/${(a as any).slug || a.id}`}
                      target="_blank"
                      rel="noreferrer"
                      prefetch={false}
                      className="p-1.5 rounded hover:bg-foreground/5 text-muted-foreground"
                      title="View public page"
                    >
                      <Eye className="w-4 h-4" />
                    </Link>
                  )}
                  <Link
                    href={`/dashboard/admin/newsroom/${a.id}`}
                    className="p-1.5 rounded hover:bg-foreground/5 text-muted-foreground"
                    title="Edit"
                  >
                    <Pencil className="w-4 h-4" />
                  </Link>
                  {a.status === "draft" && (
                    <button
                      type="button"
                      onClick={() => setStatus(a.id, "published")}
                      disabled={busy === a.id}
                      className="px-2 py-1 text-[11px] rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      Publish
                    </button>
                  )}
                  {a.status === "published" && (
                    <button
                      type="button"
                      onClick={() => setStatus(a.id, "draft")}
                      disabled={busy === a.id}
                      className="px-2 py-1 text-[11px] rounded border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
                    >
                      Unpublish
                    </button>
                  )}
                  {a.status !== "archived" && (
                    <button
                      type="button"
                      onClick={() => setStatus(a.id, "archived")}
                      disabled={busy === a.id}
                      className="px-2 py-1 text-[11px] rounded border border-foreground/15 hover:bg-foreground/5 disabled:opacity-50"
                    >
                      Archive
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => remove(a.id)}
                    disabled={busy === a.id}
                    className="p-1.5 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-50"
                    title="Delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
