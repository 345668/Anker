"use client"

/**
 * Portfolio list view — filter + sort + new-company dialog.
 *
 * Server hands in initialCompanies + initialRollup so first paint is
 * data-complete; client adds search/filter/sort + new-company creation
 * without round-tripping the server until a write happens.
 *
 * Card layout: one row per company on the desktop grid (sector chip +
 * stage + invested + last-round valuation + status badge), tight enough
 * that a 30-company fund fits in one viewport.
 */

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Building2, Plus, Loader2, Search, Activity, ArrowUpRight,
  CheckCircle2, AlertTriangle, XCircle, Eye, Filter,
} from "lucide-react"
import type {
  PortfolioCompanyFull,
  PortfolioRollup,
  CompanyStatus,
} from "@/lib/portfolio/queries"

interface Props {
  fundId: string
  initialCompanies: PortfolioCompanyFull[]
  initialRollup: PortfolioRollup
}

type SortKey = "name" | "last_round" | "invested" | "stage"

const STATUS_META: Record<CompanyStatus, { label: string; tone: string; Icon: any }> = {
  active:      { label: "Active",     tone: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", Icon: Activity },
  on_watch:    { label: "On watch",   tone: "text-amber-700 bg-amber-500/10 border-amber-500/20",      Icon: AlertTriangle },
  exited:      { label: "Exited",     tone: "text-blue-600 bg-blue-500/10 border-blue-500/20",         Icon: CheckCircle2 },
  written_off: { label: "Written-off",tone: "text-rose-600 bg-rose-500/10 border-rose-500/20",         Icon: XCircle },
}

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

export function PortfolioListClient({ fundId, initialCompanies, initialRollup }: Props) {
  const router = useRouter()
  const [companies, setCompanies] = useState(initialCompanies)
  const [rollup, setRollup] = useState(initialRollup)
  const [query, setQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<CompanyStatus | "all">("all")
  const [sectorFilter, setSectorFilter] = useState<string | "all">("all")
  const [sort, setSort] = useState<SortKey>("last_round")
  const [creating, setCreating] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Derive the sector chip list from the loaded data.
  const sectors = useMemo(() => {
    const set = new Set<string>()
    companies.forEach((c) => { if (c.sector) set.add(c.sector) })
    return Array.from(set).sort()
  }, [companies])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = companies
    if (statusFilter !== "all") rows = rows.filter((c) => c.status === statusFilter)
    if (sectorFilter !== "all") rows = rows.filter((c) => c.sector === sectorFilter)
    if (q) {
      rows = rows.filter((c) =>
        c.name.toLowerCase().includes(q)
        || (c.one_liner ?? "").toLowerCase().includes(q)
        || (c.sector ?? "").toLowerCase().includes(q)
      )
    }
    return [...rows].sort((a, b) => {
      switch (sort) {
        case "name":       return a.name.localeCompare(b.name)
        case "invested":   return (b.total_invested_amount ?? 0) - (a.total_invested_amount ?? 0)
        case "stage":      return (a.stage ?? "").localeCompare(b.stage ?? "")
        case "last_round":
        default:           return (b.last_round_at ?? "").localeCompare(a.last_round_at ?? "")
      }
    })
  }, [companies, query, statusFilter, sectorFilter, sort])

  async function createCompany(name: string, sector: string, stage: string) {
    setCreating(true); setError(null)
    try {
      const res = await fetch("/api/portfolio/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fundId, name, sector: sector || null, stage: stage || null }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Create failed (${res.status})`)
      router.push(`/dashboard/portfolio/${data.company.id}`)
    } catch (e: any) { setError(e?.message ?? "Create failed") }
    finally { setCreating(false) }
  }

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-2">
            <Building2 className="w-3 h-3" />
            <span>{fundId.toUpperCase()}</span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl tracking-tight">
            Portfolio
          </h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            Every investment in the fund. Click a card to see KPI history, latest snapshot, and operating notes.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90"
        >
          <Plus className="w-4 h-4" /> New company
        </button>
      </div>

      {/* Rollup cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden mb-8">
        <RollupCard label="Companies" value={rollup.total.toString()} sub={`${rollup.active} active`} />
        <RollupCard label="On watch"  value={rollup.on_watch.toString()} sub={`${rollup.written_off} written off`} />
        <RollupCard label="Invested"  value={shortUsd(rollup.total_invested)} sub="active + on-watch" />
        <RollupCard label="Value @ last round" value={shortUsd(rollup.total_value_at_last_round)} sub="ownership × last valuation" />
      </div>

      {/* Create panel (collapsible) */}
      {createOpen && (
        <CreatePanel onCreate={createCompany} creating={creating} error={error} onClose={() => setCreateOpen(false)} />
      )}

      {/* Filter row */}
      <div className="flex items-center gap-2 flex-wrap mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, sector, one-liner…"
            className="w-full h-9 pl-8 pr-3 text-sm border border-foreground/15 rounded-md bg-background"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CompanyStatus | "all")}
          className="h-9 px-2.5 text-sm border border-foreground/15 rounded-md bg-background"
        >
          <option value="all">All status</option>
          <option value="active">Active</option>
          <option value="on_watch">On watch</option>
          <option value="exited">Exited</option>
          <option value="written_off">Written off</option>
        </select>
        {sectors.length > 0 && (
          <select
            value={sectorFilter}
            onChange={(e) => setSectorFilter(e.target.value)}
            className="h-9 px-2.5 text-sm border border-foreground/15 rounded-md bg-background"
          >
            <option value="all">All sectors</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 px-2.5 text-sm border border-foreground/15 rounded-md bg-background"
        >
          <option value="last_round">Sort · last round</option>
          <option value="invested">Sort · invested</option>
          <option value="name">Sort · name</option>
          <option value="stage">Sort · stage</option>
        </select>
        <span className="ml-auto text-xs text-muted-foreground font-mono">
          {filtered.length}/{companies.length}
        </span>
      </div>

      {/* Company list */}
      <div className="border border-foreground/10 rounded-md divide-y divide-foreground/10 bg-background">
        {filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Building2 className="w-6 h-6 mx-auto mb-2 opacity-40" />
            No companies match your filters yet.
            {companies.length === 0 && (
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  Add the first one →
                </button>
              </div>
            )}
          </div>
        ) : filtered.map((c) => (
          <Link
            key={c.id}
            href={`/dashboard/portfolio/${c.id}`}
            className="flex items-center gap-4 px-5 py-4 hover:bg-foreground/[0.02] group"
          >
            <div className="w-9 h-9 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0">
              <Building2 className="w-4 h-4 text-foreground/60" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-display text-base text-foreground group-hover:translate-x-0.5 transition-transform">
                  {c.name}
                </span>
                <StatusBadge status={c.status} />
                {c.stage && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground border border-foreground/15 px-1.5 py-0.5 rounded">
                    {c.stage}
                  </span>
                )}
                {c.sector && (
                  <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    · {c.sector}
                  </span>
                )}
              </div>
              {c.one_liner && (
                <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                  {c.one_liner}
                </div>
              )}
            </div>
            <div className="hidden md:flex flex-col items-end gap-0.5 shrink-0 text-right">
              <div className="text-sm font-mono text-foreground">
                {c.total_invested_amount != null ? shortUsd(c.total_invested_amount) : "—"}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                invested
              </div>
            </div>
            <div className="hidden lg:flex flex-col items-end gap-0.5 shrink-0 text-right">
              <div className="text-sm font-mono text-foreground">
                {c.last_round_valuation != null ? shortUsd(c.last_round_valuation) : "—"}
              </div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                {c.last_round_name ?? "last round"}
              </div>
            </div>
            <ArrowUpRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  )
}

function RollupCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background p-4 lg:p-5">
      <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </div>
      <div className="font-display text-2xl lg:text-3xl mt-1 tracking-tight">
        {value}
      </div>
      {sub && (
        <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
          {sub}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: CompanyStatus }) {
  const meta = STATUS_META[status]
  const Icon = meta.Icon
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider border ${meta.tone}`}>
      <Icon className="w-2.5 h-2.5" />
      {meta.label}
    </span>
  )
}

function CreatePanel({
  onCreate, creating, error, onClose,
}: {
  onCreate: (name: string, sector: string, stage: string) => Promise<void>
  creating: boolean
  error: string | null
  onClose: () => void
}) {
  const [name, setName] = useState("")
  const [sector, setSector] = useState("")
  const [stage, setStage] = useState("")
  return (
    <div className="border border-foreground/15 rounded-md p-5 mb-6 bg-foreground/[0.02]">
      <div className="flex items-end gap-3 flex-wrap">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
            Name <span className="text-rose-600">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sortable Labs"
            className="w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"
            autoFocus
          />
        </div>
        <div className="min-w-[140px]">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
            Sector
          </label>
          <input
            type="text"
            value={sector}
            onChange={(e) => setSector(e.target.value)}
            placeholder="fintech, ai-infra"
            className="w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"
          />
        </div>
        <div className="min-w-[140px]">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
            Stage
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full h-9 px-2.5 text-sm border border-foreground/15 rounded-md bg-background"
          >
            <option value="">—</option>
            <option value="incubation">Incubation</option>
            <option value="pre-seed">Pre-seed</option>
            <option value="seed">Seed</option>
            <option value="series-a">Series A</option>
            <option value="series-b+">Series B+</option>
            <option value="growth">Growth</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => onCreate(name.trim(), sector.trim(), stage.trim())}
          disabled={creating || !name.trim()}
          className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {creating
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating…</>
            : <>Create</>}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-9 px-3 text-sm rounded-md border border-foreground/15 hover:bg-foreground/5"
        >
          Cancel
        </button>
      </div>
      {error && (
        <div className="mt-3 text-xs text-rose-600 font-mono">
          {error}
        </div>
      )}
    </div>
  )
}

/** Compact USD formatter: $1.2M, $500K, $42K, $850. */
function shortUsd(n: number): string {
  if (!n) return "$0"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return USD.format(n)
}
