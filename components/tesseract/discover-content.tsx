"use client"

/**
 * Discover — the directory through the persona's lens (docs/architecture/12).
 *
 * Founders see investors; fund managers switch between LPs, co-investors and
 * listed startups; LPs see fund managers and listed funds. Rows carry what the
 * workspace knows: the fit score from the latest matching run, whether the
 * investor is already in the CRM, and the email verification status.
 */
import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { requestJson, swrFetcher } from "@/lib/http/client"
import {
  AlertCircle, Bookmark, Building2, CheckCircle2, ChevronLeft, ChevronRight, Download, ExternalLink,
  Filter, Globe, Linkedin, Loader2, Mail, RefreshCw, Search, Sparkles, Target, Trash2, X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { PageHeader } from "@/components/shell/page-header"
import { StaffBadge } from "@/components/shell/staff-badge"
import { DataError, DataLoading } from "@/components/shell/data-state"
import type { DiscoveryFacets } from "@/lib/platform/discovery"
import type { Kind, LensId, Persona } from "@/lib/platform/discovery-lenses"
import { statusLabel, type VerificationStatus } from "@/lib/email-verification/types"

export interface LensInfo { id: LensId; label: string; description: string; kinds: Kind[]; canSave: boolean }
export interface SavedSearch { id: string; name: string; lens: string; filters: Record<string, string> }

interface Props {
  persona: Persona
  lenses: LensInfo[]
  matchingHref: string
  canSave: boolean
  isAdmin?: boolean
  initial: { lens: LensId; kind: Kind; rows: Row[]; total: number; facets: DiscoveryFacets }
  savedSearches?: SavedSearch[]
}

type Row = Record<string, any>

const CHECK_SIZES = ["All sizes", "$10K-$50K", "$50K-$100K", "$100K-$250K", "$250K-$500K", "$500K-$1M", "$1M-$5M", "$5M-$10M", "$10M-$25M", "$25M+"]
const PAGE_SIZE = 50

const money = (n: unknown) => {
  const v = Number(n)
  if (!Number.isFinite(v) || v <= 0) return null
  return v >= 1e6 ? `$${+(v / 1e6).toFixed(1)}M` : `$${Math.round(v / 1e3)}K`
}
const checkRange = (r: Row) => {
  const lo = money(r.check_min), hi = money(r.check_max)
  return lo && hi && lo !== hi ? `${lo}–${hi}` : lo ?? hi ?? "—"
}
const rowKind = (kind: Kind) => (kind === "firms" ? "firm" : "contact")

export function DiscoverContent({ persona, lenses, matchingHref, canSave, isAdmin = false, initial, savedSearches = [] }: Props) {
  const [lens, setLens] = useState<LensId>(initial.lens)
  const [kind, setKind] = useState<Kind>(initial.kind)
  const [search, setSearch] = useState("")
  const [debounced, setDebounced] = useState("")
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [sort, setSort] = useState<"name" | "fit" | "updated">("name")
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [status, setStatus] = useState<{ type: "success" | "error" | null; message: string }>({ type: null, message: "" })
  const [busy, setBusy] = useState(false)
  const [searches, setSearches] = useState<SavedSearch[]>(savedSearches)

  const lensInfo = lenses.find((l) => l.id === lens) ?? lenses[0]

  useEffect(() => { const t = setTimeout(() => setDebounced(search.trim()), 350); return () => clearTimeout(t) }, [search])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [lens, kind, debounced, filters, sort])
  useEffect(() => { if (!lensInfo.kinds.includes(kind)) setKind(lensInfo.kinds[0]) }, [lensInfo, kind])

  const query = useMemo(() => {
    const p = new URLSearchParams({ lens, kind, page: String(page), limit: String(PAGE_SIZE), sort })
    if (debounced) p.set("search", debounced)
    for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v)
    return p
  }, [lens, kind, page, sort, debounced, filters])

  const { data, error, isLoading, mutate } = useSWR<{
    rows: Row[]; total: number; totalPages: number; facets: DiscoveryFacets; searchMode: "semantic" | "text" | null
  }>(`/api/discovery?${query}`, swrFetcher, {
    keepPreviousData: true,
    fallbackData: page === 1 && !debounced && !Object.values(filters).some(Boolean) && lens === initial.lens && kind === initial.kind
      ? { rows: initial.rows, total: initial.total, totalPages: Math.max(1, Math.ceil(initial.total / PAGE_SIZE)), facets: initial.facets, searchMode: null }
      : undefined,
  })

  const rows = data?.rows ?? []
  const facets = data?.facets ?? initial.facets
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 1

  const toggle = (id: string) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(String(r.id)))
  const toggleAll = () => setSelected((prev) => {
    const next = new Set(prev)
    rows.forEach((r) => (allOnPage ? next.delete(String(r.id)) : next.add(String(r.id))))
    return next
  })

  const save = useCallback(async (items: Row[]) => {
    setBusy(true)
    try {
      const res = await requestJson<{ inserted: number; alreadyPresent: number; missing: number }>("/api/discovery/save", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: items.map((r) => ({ kind: rowKind(kind), id: r.id, name: r.name, title: r.title, email: r.email, linkedin: r.linkedin, location: r.location, type: r.type })) }),
      })
      setSelected(new Set())
      void mutate()
      setStatus({ type: "success", message: `${res.inserted} saved to your CRM${res.alreadyPresent ? ` · ${res.alreadyPresent} were already there` : ""}.` })
    } catch (e) {
      setStatus({ type: "error", message: e instanceof Error ? e.message : "Could not save. Please retry." })
    } finally { setBusy(false) }
  }, [kind, mutate])

  const exportCsv = useCallback(async () => {
    setBusy(true)
    try {
      const res = await fetch("/api/discovery/export", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lens, kind, filters: Object.fromEntries(query), ids: selected.size ? [...selected] : undefined }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Export failed.")
      const blob = await res.blob()
      const a = document.createElement("a")
      a.href = URL.createObjectURL(blob)
      a.download = `anker-${lens}-${kind}.csv`
      a.click()
      URL.revokeObjectURL(a.href)
      setStatus({ type: "success", message: `Exported ${res.headers.get("X-Export-Rows") ?? ""} rows · ${res.headers.get("X-Export-Rows-Left") ?? "?"} left today.` })
    } catch (e) {
      setStatus({ type: "error", message: e instanceof Error ? e.message : "Export failed." })
    } finally { setBusy(false) }
  }, [lens, kind, query, selected])

  const saveSearch = async () => {
    const name = window.prompt("Name this search")
    if (!name) return
    try {
      const res = await requestJson<{ search: SavedSearch }>("/api/discovery/saved-searches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, lens, filters: { ...filters, kind, sort, ...(debounced ? { search: debounced } : {}) } }),
      })
      setSearches((s) => [res.search, ...s])
      setStatus({ type: "success", message: "Search saved." })
    } catch (e) { setStatus({ type: "error", message: e instanceof Error ? e.message : "Could not save the search." }) }
  }
  const applySearch = (s: SavedSearch) => {
    setLens(s.lens as LensId)
    const { kind: k, sort: so, search: se, ...rest } = s.filters ?? {}
    if (k) setKind(k as Kind)
    if (so) setSort(so as any)
    setSearch(se ?? "")
    setFilters(rest)
  }
  const deleteSearch = async (id: string) => {
    await fetch(`/api/discovery/saved-searches?id=${encodeURIComponent(id)}`, { method: "DELETE" })
    setSearches((s) => s.filter((x) => x.id !== id))
  }

  const enrich = async (row: Row) => {
    if (!isAdmin) return
    setBusy(true)
    try {
      const body = kind === "firms" ? { firmId: row.id } : { investorId: row.id }
      const res = await requestJson<{ changes?: unknown[] }>("/api/admin/enrich", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      setStatus({ type: "success", message: `Enrichment completed · ${res.changes?.length ?? 0} field changes.` })
      void mutate()
    } catch (e) { setStatus({ type: "error", message: e instanceof Error ? e.message : "Enrichment failed." }) } finally { setBusy(false) }
  }

  const facetSelect = (key: string, label: string, options: { value: string; label: string; n: number }[]) => (
    <label className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <select
        aria-label={label}
        className="h-10 rounded-md border border-foreground/15 bg-background px-2 text-sm"
        value={filters[key] ?? ""}
        onChange={(e) => setFilters((f) => ({ ...f, [key]: e.target.value }))}
      >
        <option value="">All {label.toLowerCase()}</option>
        {options.slice(0, 200).map((o) => <option key={o.value} value={o.value}>{o.label} ({o.n.toLocaleString()})</option>)}
      </select>
    </label>
  )

  return (
    <div className="px-6 lg:px-8 pb-16">
      <PageHeader
        title={<span className="flex items-center gap-2">Discover{isAdmin && <StaffBadge label="Admin" />}</span>}
        description={lensInfo.description}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {searches.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" className="gap-2"><Bookmark className="w-4 h-4" />Saved</Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {searches.map((s) => (
                    <DropdownMenuItem key={s.id} onClick={() => applySearch(s)} className="flex items-center justify-between gap-4">
                      <span>{s.name}</span>
                      <button aria-label={`Delete ${s.name}`} onClick={(e) => { e.stopPropagation(); void deleteSearch(s.id) }}><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canSave && <Button variant="outline" className="gap-2" onClick={saveSearch}><Bookmark className="w-4 h-4" />Save search</Button>}
            <Button variant="outline" className="gap-2" onClick={exportCsv} disabled={busy}><Download className="w-4 h-4" />Export CSV</Button>
            {persona !== "lp" && <Button asChild className="gap-2 bg-foreground text-background"><Link href={matchingHref}><Sparkles className="w-4 h-4" />{persona === "founder" ? "Find investors" : "Run matching"}</Link></Button>}
          </div>
        }
      />

      {lenses.length > 1 && (
        <div role="tablist" aria-label="Directory" className="flex flex-wrap gap-2 mt-4">
          {lenses.map((l) => (
            <button key={l.id} role="tab" aria-selected={l.id === lens} onClick={() => setLens(l.id)}
              className={`px-3 py-2 rounded-md text-sm border transition-colors ${l.id === lens ? "border-foreground/30 bg-foreground/5 font-medium" : "border-foreground/10 text-muted-foreground hover:text-foreground"}`}>
              {l.label}
            </button>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        {lensInfo.kinds.length > 1 && (
          <div className="flex rounded-md border border-foreground/15 overflow-hidden">
            {lensInfo.kinds.map((k) => (
              <button key={k} aria-pressed={k === kind} onClick={() => setKind(k)}
                className={`px-3 h-10 text-sm ${k === kind ? "bg-foreground/10 font-medium" : "text-muted-foreground"}`}>
                {k === "firms" ? "Firms" : k === "investors" ? "People" : k === "startups" ? "Startups" : "Funds"}
              </button>
            ))}
          </div>
        )}
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9 h-10" placeholder={`Search ${lensInfo.label.toLowerCase()} — two words or more searches theses, not just names`} value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        </div>
        <label className="flex flex-col gap-1">
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Sort</span>
          <select aria-label="Sort" className="h-10 rounded-md border border-foreground/15 bg-background px-2 text-sm" value={sort} onChange={(e) => setSort(e.target.value as any)}>
            <option value="name">Name</option>
            {persona === "founder" && <option value="fit">Fit with your round</option>}
            <option value="updated">Recently updated</option>
          </select>
        </label>
      </div>

      {(kind === "firms" || kind === "investors") && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          {facetSelect("country", "Country", facets.country)}
          {facetSelect("sector", "Sector", facets.sector)}
          {facetSelect("stage", "Stage", facets.stage)}
          {facetSelect("class", "Type", facets.class)}
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Check size</span>
            <select aria-label="Check size" className="h-10 rounded-md border border-foreground/15 bg-background px-2 text-sm" value={filters.check ?? ""} onChange={(e) => setFilters((f) => ({ ...f, check: e.target.value }))}>
              {CHECK_SIZES.map((c) => <option key={c} value={c === "All sizes" ? "" : c}>{c}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1 justify-end pb-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.hasEmail === "true"} onChange={(e) => setFilters((f) => ({ ...f, hasEmail: e.target.checked ? "true" : "" }))} />Has email</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={filters.hasLinkedIn === "true"} onChange={(e) => setFilters((f) => ({ ...f, hasLinkedIn: e.target.checked ? "true" : "" }))} />Has LinkedIn</label>
            {canSave && <label className="flex items-center gap-2"><input type="checkbox" checked={filters.hideSaved === "true"} onChange={(e) => setFilters((f) => ({ ...f, hideSaved: e.target.checked ? "true" : "" }))} />Hide saved</label>}
          </div>
        </div>
      )}

      {status.type && (
        <div role="alert" className={`mt-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${status.type === "success" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
          {status.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{status.message}</span>
          <button className="ml-auto" aria-label="Dismiss" onClick={() => setStatus({ type: null, message: "" })}><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <span>{total.toLocaleString()} {kind === "investors" ? "people" : kind}{data?.searchMode === "semantic" ? " · ranked by how closely their thesis matches your words" : ""}</span>
        {(Object.values(filters).some(Boolean) || debounced) && (
          <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { setFilters({}); setSearch("") }}><Filter className="w-3.5 h-3.5" />Clear filters</button>
        )}
        <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => void mutate()}><RefreshCw className="w-3.5 h-3.5" />Refresh</button>
      </div>

      {selected.size > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-foreground/15 bg-foreground/[0.03] p-3">
          <span className="text-sm font-medium">{selected.size} selected</span>
          {canSave && lensInfo.canSave && (
            <Button size="sm" className="gap-2" disabled={busy} onClick={() => save(rows.filter((r) => selected.has(String(r.id))))}>
              <Target className="w-4 h-4" />Save to CRM
            </Button>
          )}
          <Button size="sm" variant="outline" className="gap-2" disabled={busy} onClick={exportCsv}><Download className="w-4 h-4" />Export selection</Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {error ? <DataError label="Could not load the directory." onRetry={() => void mutate()} />
        : isLoading && !rows.length ? <DataLoading label="Loading the directory" />
        : rows.length === 0 ? (
          <p className="mt-10 text-sm text-muted-foreground">Nothing matches these filters. Clear a filter, or search in different words.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-lg border border-foreground/10">
            <table className="w-full text-sm">
              <thead className="bg-foreground/5">
                <tr>
                  <th className="p-3 w-8"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={toggleAll} /></th>
                  <th className="p-3 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{kind === "firms" ? "Firm" : kind === "investors" ? "Person" : kind === "startups" ? "Company" : "Fund"}</th>
                  {kind !== "funds" && <th className="p-3 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Focus</th>}
                  {(kind === "firms" || kind === "investors") && <th className="p-3 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Check</th>}
                  {kind === "funds" && <th className="p-3 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Target</th>}
                  <th className="p-3 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Contact</th>
                  {persona === "founder" && <th className="p-3 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Fit</th>}
                  <th className="p-3 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.id)} className="border-t border-foreground/5 align-top">
                    <td className="p-3"><input type="checkbox" aria-label={`Select ${r.name}`} checked={selected.has(String(r.id))} onChange={() => toggle(String(r.id))} /></td>
                    <td className="p-3">
                      <div className="font-medium flex items-center gap-2">
                        {r.name}
                        {r.crm_stage && <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[10px] font-mono uppercase">In CRM · {String(r.crm_stage).replace(/_/g, " ")}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {[r.title, r.firm_name, r.type, r.location].filter(Boolean).join(" · ")}
                      </div>
                      {r.description && <div className="mt-1 text-xs text-muted-foreground line-clamp-2 max-w-[520px]">{r.description}</div>}
                    </td>
                    {kind !== "funds" && (
                      <td className="p-3 text-xs text-muted-foreground max-w-[220px]">
                        {(r.norm_sectors ?? r.sectors ?? []).slice(0, 4).join(", ") || "—"}
                        {(r.norm_stages ?? []).length > 0 && <div className="mt-1">{(r.norm_stages ?? []).join(", ")}</div>}
                        {r.stage && <div className="mt-1">{r.stage}</div>}
                      </td>
                    )}
                    {(kind === "firms" || kind === "investors") && <td className="p-3 font-mono text-xs">{checkRange(r)}</td>}
                    {kind === "funds" && <td className="p-3 font-mono text-xs">{money(r.target_size) ?? "—"} {r.currency ?? ""}{r.vintage_year ? ` · ${r.vintage_year}` : ""}</td>}
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        {r.email && (
                          <a href={`mailto:${r.email}`} className="inline-flex items-center gap-1 text-xs hover:underline" title={r.email}>
                            <Mail className="w-3.5 h-3.5" />{statusLabel(r.email_status as VerificationStatus | null)}
                          </a>
                        )}
                        {r.linkedin && <a href={r.linkedin} target="_blank" rel="noopener noreferrer" aria-label={`${r.name} on LinkedIn`}><Linkedin className="w-4 h-4 text-muted-foreground hover:text-foreground" /></a>}
                        {r.website && <a href={r.website} target="_blank" rel="noopener noreferrer" aria-label={`${r.name} website`}><Globe className="w-4 h-4 text-muted-foreground hover:text-foreground" /></a>}
                        {r.founder_linkedin && <a href={r.founder_linkedin} target="_blank" rel="noopener noreferrer" aria-label="Founder on LinkedIn"><ExternalLink className="w-4 h-4 text-muted-foreground hover:text-foreground" /></a>}
                        {!r.email && !r.linkedin && !r.website && <span className="text-xs text-muted-foreground">—</span>}
                      </div>
                    </td>
                    {persona === "founder" && (
                      <td className="p-3 font-mono text-xs">
                        {r.fit_score != null ? <span title={`Rank ${r.fit_rank} in your latest run`}>{Number(r.fit_score).toFixed(1)}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                    )}
                    <td className="p-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        {canSave && lensInfo.canSave && !r.crm_stage && (
                          <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => save([r])}>Save</Button>
                        )}
                        {isAdmin && (kind === "firms" || kind === "investors") && (
                          <Button size="sm" variant="ghost" className="h-8" disabled={busy} onClick={() => enrich(r)}>{busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Enrich"}</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {page} of {totalPages.toLocaleString()} · showing {((page - 1) * PAGE_SIZE + 1).toLocaleString()}–{Math.min(page * PAGE_SIZE, total).toLocaleString()}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4" />Previous</Button>
            <Button variant="outline" size="sm" className="gap-1" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next<ChevronRight className="w-4 h-4" /></Button>
          </div>
        </div>
      )}

      {persona === "vc" && lens === "vc_startups" && (
        <p className="mt-6 text-xs text-muted-foreground flex items-center gap-2">
          <Building2 className="w-3.5 h-3.5" />Founders choose whether their company is listed here. Nothing else from their workspace is visible.
        </p>
      )}
    </div>
  )
}
