"use client"

/**
 * Portfolio company detail page.
 *
 * Three sections, top-down:
 *
 *   1. Header — name, status badge, sector/stage chips, edit/delete buttons
 *   2. Profile form — editable card with investment, ownership, last round
 *      etc.; PATCHes /api/portfolio/companies/[id] on save
 *   3. KPI panel — left: latest snapshot card with the metrics fund managers
 *                  care about; right: minimal SVG sparklines for revenue,
 *                  cash, headcount; bottom: "log this month" form that
 *                  POSTs /api/portfolio/companies/[id]/kpis
 *
 * We render the sparklines inline with SVG (no chart library) — keeps the
 * page bundle small and matches the rest of the dashboard's design density.
 */

import Link from "next/link"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Save, Trash2, Loader2, AlertTriangle, CheckCircle2,
  Activity, Building2, ExternalLink, Calendar, Linkedin, Plus,
} from "lucide-react"
import type {
  PortfolioCompanyFull,
  KpiSnapshot,
  CompanyStatus,
} from "@/lib/portfolio/queries"

interface Props {
  initialCompany: PortfolioCompanyFull
  initialLatestKpi: KpiSnapshot | null
  initialKpiHistory: KpiSnapshot[]
}

const STATUS_OPTIONS: { value: CompanyStatus; label: string }[] = [
  { value: "active",      label: "Active" },
  { value: "on_watch",    label: "On watch" },
  { value: "exited",      label: "Exited" },
  { value: "written_off", label: "Written off" },
]

const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })

export function PortfolioDetailClient({
  initialCompany, initialLatestKpi, initialKpiHistory,
}: Props) {
  const router = useRouter()
  const [c, setC] = useState(initialCompany)
  const [latestKpi, setLatestKpi] = useState(initialLatestKpi)
  const [history, setHistory] = useState(initialKpiHistory)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  function set<K extends keyof PortfolioCompanyFull>(key: K, val: PortfolioCompanyFull[K]) {
    setC((p) => ({ ...p, [key]: val }))
  }

  async function save() {
    setSaving(true); setError(null); setSuccess(null)
    try {
      const res = await fetch(`/api/portfolio/companies/${c.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: c.name,
          website: c.website,
          linkedinUrl: c.linkedin_url,
          oneLiner: c.one_liner,
          description: c.description,
          sector: c.sector,
          subSector: c.sub_sector,
          geography: c.geography,
          stage: c.stage,
          foundedYear: c.founded_year,
          firstCheckAt: c.first_check_at,
          firstCheckAmount: c.first_check_amount,
          totalInvestedAmount: c.total_invested_amount,
          ownershipPct: c.ownership_pct,
          lastRoundAt: c.last_round_at,
          lastRoundName: c.last_round_name,
          lastRoundValuation: c.last_round_valuation,
          status: c.status,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      setC(data.company)
      setSuccess("Saved.")
    } catch (e: any) { setError(e?.message ?? "Save failed") }
    finally { setSaving(false) }
  }

  async function remove() {
    if (!confirm(`Delete ${c.name}? Cascades to ${history.length} KPI snapshot(s). Cannot be undone.`)) return
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/companies/${c.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data?.error ?? `Delete failed (${res.status})`)
      }
      router.push("/dashboard/portfolio")
    } catch (e: any) { setError(e?.message ?? "Delete failed") }
    finally { setSaving(false) }
  }

  async function addKpi(input: any) {
    try {
      const res = await fetch(`/api/portfolio/companies/${c.id}/kpis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Snapshot upsert failed (${res.status})`)
      // Refresh history + latest in-place.
      setLatestKpi(data.snapshot)
      setHistory((prev) => {
        const next = prev.filter((r) => r.month_end !== data.snapshot.month_end)
        return [data.snapshot, ...next].sort((a, b) => b.month_end.localeCompare(a.month_end))
      })
      setSuccess(`Snapshot saved for ${data.snapshot.month_end}.`)
    } catch (e: any) { setError(e?.message ?? "Snapshot upsert failed") }
  }

  const trends = useMemo(() => buildTrends(history), [history])

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <Link
          href="/dashboard/portfolio"
          className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Portfolio
        </Link>
        <div className="mt-3 flex items-start gap-4 flex-wrap">
          <div className="w-12 h-12 rounded-md bg-foreground/5 border border-foreground/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-foreground/60" />
          </div>
          <div className="flex-1 min-w-[200px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-3xl tracking-tight">{c.name}</h1>
              <select
                value={c.status}
                onChange={(e) => set("status", e.target.value as CompanyStatus)}
                className="h-7 px-2 text-xs border border-foreground/15 rounded-md bg-background"
              >
                {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-2 text-xs font-mono uppercase tracking-wider text-muted-foreground">
              {c.stage   && <span>{c.stage}</span>}
              {c.sector  && <span>· {c.sector}</span>}
              {c.geography && <span>· {c.geography}</span>}
              {c.last_round_name && c.last_round_valuation != null && (
                <span>· {c.last_round_name} @ {shortUsd(c.last_round_valuation)}</span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-2">
              {c.website && (
                <a href={c.website} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground">
                  <ExternalLink className="w-3 h-3" /> Website
                </a>
              )}
              {c.linkedin_url && (
                <a href={c.linkedin_url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground">
                  <Linkedin className="w-3 h-3" /> LinkedIn
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button" onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
            <button
              type="button" onClick={remove} disabled={saving}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border border-rose-500/30 text-rose-600 hover:bg-rose-500/5 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-3 py-2 text-xs font-mono text-rose-600 border border-rose-500/30 bg-rose-500/5 rounded-md inline-flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" /> {error}
        </div>
      )}
      {success && (
        <div className="px-3 py-2 text-xs font-mono text-emerald-700 border border-emerald-500/30 bg-emerald-500/5 rounded-md inline-flex items-center gap-2">
          <CheckCircle2 className="w-3 h-3" /> {success}
        </div>
      )}

      {/* Profile form */}
      <section className="border border-foreground/10 rounded-md p-6 grid md:grid-cols-3 gap-x-6 gap-y-4">
        <h2 className="md:col-span-3 font-display text-lg tracking-tight mb-1">Profile</h2>
        <Field label="One-liner">
          <input type="text" value={c.one_liner ?? ""} onChange={(e) => set("one_liner", e.target.value)} className={input} />
        </Field>
        <Field label="Website">
          <input type="url" value={c.website ?? ""} onChange={(e) => set("website", e.target.value)} placeholder="https://…" className={input} />
        </Field>
        <Field label="LinkedIn">
          <input type="url" value={c.linkedin_url ?? ""} onChange={(e) => set("linkedin_url", e.target.value)} placeholder="https://linkedin.com/company/…" className={input} />
        </Field>
        <Field label="Sector">
          <input type="text" value={c.sector ?? ""} onChange={(e) => set("sector", e.target.value)} className={input} />
        </Field>
        <Field label="Sub-sector">
          <input type="text" value={c.sub_sector ?? ""} onChange={(e) => set("sub_sector", e.target.value)} className={input} />
        </Field>
        <Field label="Geography">
          <input type="text" value={c.geography ?? ""} onChange={(e) => set("geography", e.target.value)} placeholder="MENA, SEA, Global" className={input} />
        </Field>
        <Field label="Stage">
          <select value={c.stage ?? ""} onChange={(e) => set("stage", e.target.value)} className={input}>
            <option value="">—</option>
            <option value="incubation">Incubation</option>
            <option value="pre-seed">Pre-seed</option>
            <option value="seed">Seed</option>
            <option value="series-a">Series A</option>
            <option value="series-b+">Series B+</option>
            <option value="growth">Growth</option>
          </select>
        </Field>
        <Field label="Founded year">
          <input type="number" value={c.founded_year ?? ""} onChange={(e) => set("founded_year", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="First check date">
          <input type="date" value={c.first_check_at ?? ""} onChange={(e) => set("first_check_at", e.target.value || null)} className={input} />
        </Field>
        <Field label="First check (USD)">
          <input type="number" step="1000" value={c.first_check_amount ?? ""} onChange={(e) => set("first_check_amount", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="Total invested (USD)">
          <input type="number" step="1000" value={c.total_invested_amount ?? ""} onChange={(e) => set("total_invested_amount", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="Ownership %" hint="0.0500 = 5%">
          <input type="number" step="0.0001" min="0" max="1" value={c.ownership_pct ?? ""} onChange={(e) => set("ownership_pct", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="Last round date">
          <input type="date" value={c.last_round_at ?? ""} onChange={(e) => set("last_round_at", e.target.value || null)} className={input} />
        </Field>
        <Field label="Last round name">
          <input type="text" value={c.last_round_name ?? ""} onChange={(e) => set("last_round_name", e.target.value)} placeholder="Series A" className={input} />
        </Field>
        <Field label="Last round valuation">
          <input type="number" step="100000" value={c.last_round_valuation ?? ""} onChange={(e) => set("last_round_valuation", e.target.value ? Number(e.target.value) : null)} className={input} />
        </Field>
        <Field label="Description" className="md:col-span-3">
          <textarea
            value={c.description ?? ""}
            onChange={(e) => set("description", e.target.value)}
            rows={3}
            className={`${input} resize-y`}
          />
        </Field>
      </section>

      {/* KPI panel */}
      <section className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-2 border border-foreground/10 rounded-md p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg tracking-tight">Latest snapshot</h2>
            {latestKpi?.month_end && (
              <span className="text-xs font-mono text-muted-foreground">
                <Calendar className="w-3 h-3 inline mr-1" />
                {latestKpi.month_end}
              </span>
            )}
          </div>
          {latestKpi ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <KpiCell label="Cash" value={latestKpi.cash_balance != null ? shortUsd(latestKpi.cash_balance) : "—"} />
              <KpiCell label="Burn" value={latestKpi.monthly_burn != null ? shortUsd(latestKpi.monthly_burn) + "/mo" : "—"} />
              <KpiCell label="Runway" value={latestKpi.runway_months != null ? `${latestKpi.runway_months} mo` : "—"} />
              <KpiCell label="Revenue" value={latestKpi.monthly_revenue != null ? shortUsd(latestKpi.monthly_revenue) + "/mo" : "—"} />
              <KpiCell label="MoM growth" value={latestKpi.revenue_growth_mom != null ? `${(latestKpi.revenue_growth_mom * 100).toFixed(1)}%` : "—"} />
              <KpiCell label="Gross margin" value={latestKpi.gross_margin_pct != null ? `${(latestKpi.gross_margin_pct * 100).toFixed(0)}%` : "—"} />
              <KpiCell label="Headcount" value={latestKpi.headcount?.toString() ?? "—"} />
              <KpiCell label="Customers" value={latestKpi.customers?.toString() ?? "—"} />
              <KpiCell label="ARR" value={latestKpi.arr != null ? shortUsd(latestKpi.arr) : "—"} className="col-span-2" />
              {latestKpi.notes && (
                <div className="col-span-2 mt-2 text-xs text-muted-foreground border-t border-foreground/10 pt-2">
                  <div className="font-mono uppercase tracking-wider text-[10px] mb-1">Notes</div>
                  {latestKpi.notes}
                </div>
              )}
            </dl>
          ) : (
            <div className="text-sm text-muted-foreground py-6 text-center">
              No KPI snapshots yet. Add one below to start the trendline.
            </div>
          )}
        </div>

        <div className="lg:col-span-3 border border-foreground/10 rounded-md p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg tracking-tight">Trends · last {history.length} mo</h2>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </div>
          {history.length >= 2 ? (
            <div className="space-y-3">
              <Sparkline label="Revenue"   series={trends.revenue}  formatter={(v) => shortUsd(v)} />
              <Sparkline label="Cash"      series={trends.cash}     formatter={(v) => shortUsd(v)} />
              <Sparkline label="Headcount" series={trends.headcount} formatter={(v) => v.toString()} />
              <Sparkline label="Burn"      series={trends.burn}     formatter={(v) => shortUsd(v) + "/mo"} />
            </div>
          ) : (
            <div className="text-sm text-muted-foreground py-6 text-center">
              Need at least 2 monthly snapshots to draw a trend.
            </div>
          )}
        </div>
      </section>

      {/* Add snapshot form */}
      <AddKpiPanel onAdd={addKpi} />

      {/* History table */}
      {history.length > 0 && (
        <section className="border border-foreground/10 rounded-md overflow-hidden">
          <div className="px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
            <h2 className="font-display text-lg tracking-tight">History</h2>
            <span className="text-xs font-mono text-muted-foreground">{history.length} months</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-foreground/[0.02] text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-normal">Month</th>
                  <th className="text-right px-3 py-2 font-normal">Cash</th>
                  <th className="text-right px-3 py-2 font-normal">Burn</th>
                  <th className="text-right px-3 py-2 font-normal">Runway</th>
                  <th className="text-right px-3 py-2 font-normal">Revenue</th>
                  <th className="text-right px-3 py-2 font-normal">MoM</th>
                  <th className="text-right px-3 py-2 font-normal">HC</th>
                  <th className="text-left px-3 py-2 font-normal">Source</th>
                </tr>
              </thead>
              <tbody>
                {history.map((k) => (
                  <tr key={k.month_end} className="border-t border-foreground/5">
                    <td className="px-4 py-2 font-mono text-xs">{k.month_end}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{k.cash_balance != null ? shortUsd(k.cash_balance) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{k.monthly_burn != null ? shortUsd(k.monthly_burn) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{k.runway_months ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{k.monthly_revenue != null ? shortUsd(k.monthly_revenue) : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{k.revenue_growth_mom != null ? `${(k.revenue_growth_mom * 100).toFixed(0)}%` : "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-xs">{k.headcount ?? "—"}</td>
                    <td className="px-3 py-2 text-[10px] font-mono uppercase text-muted-foreground">{k.source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  )
}

const input = "w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background"

function Field({
  label, hint, children, className,
}: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between">
        <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
          {label}
        </label>
        {hint && <span className="text-[10px] font-mono text-muted-foreground/70">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function KpiCell({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground font-mono mt-0.5">{value}</dd>
    </div>
  )
}

function AddKpiPanel({ onAdd }: { onAdd: (input: any) => Promise<void> }) {
  const today = new Date()
  const defaultMonth = new Date(today.getFullYear(), today.getMonth(), 0).toISOString().slice(0, 10) // last day of prev month
  const [monthEnd, setMonthEnd] = useState(defaultMonth)
  const [cash, setCash] = useState("")
  const [burn, setBurn] = useState("")
  const [revenue, setRevenue] = useState("")
  const [gm, setGm] = useState("")
  const [hc, setHc] = useState("")
  const [customers, setCustomers] = useState("")
  const [arr, setArr] = useState("")
  const [notes, setNotes] = useState("")
  const [busy, setBusy] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      await onAdd({
        monthEnd,
        cashBalance: numOrNull(cash),
        monthlyBurn: numOrNull(burn),
        monthlyRevenue: numOrNull(revenue),
        grossMarginPct: gm ? Number(gm) / 100 : null,
        headcount: hc ? Number(hc) : null,
        customers: customers ? Number(customers) : null,
        arr: numOrNull(arr),
        notes: notes || null,
      })
      // Reset numeric fields; keep month so the user can quickly add the next.
      setCash(""); setBurn(""); setRevenue(""); setGm(""); setHc(""); setCustomers(""); setArr(""); setNotes("")
    } finally { setBusy(false) }
  }

  return (
    <section className="border border-foreground/10 rounded-md p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-lg tracking-tight">Log monthly snapshot</h2>
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Re-submitting an existing month overwrites it.
        </span>
      </div>
      <div className="grid md:grid-cols-4 gap-3">
        <Field label="Month end" hint="snaps to last-of-month">
          <input type="date" value={monthEnd} onChange={(e) => setMonthEnd(e.target.value)} className={input} />
        </Field>
        <Field label="Cash balance (USD)">
          <input type="number" step="1000" value={cash} onChange={(e) => setCash(e.target.value)} className={input} />
        </Field>
        <Field label="Monthly burn (USD)" hint="positive number">
          <input type="number" step="1000" value={burn} onChange={(e) => setBurn(e.target.value)} className={input} />
        </Field>
        <Field label="Monthly revenue (USD)">
          <input type="number" step="1000" value={revenue} onChange={(e) => setRevenue(e.target.value)} className={input} />
        </Field>
        <Field label="Gross margin %" hint="0–100">
          <input type="number" step="1" min="0" max="100" value={gm} onChange={(e) => setGm(e.target.value)} className={input} />
        </Field>
        <Field label="Headcount">
          <input type="number" step="1" value={hc} onChange={(e) => setHc(e.target.value)} className={input} />
        </Field>
        <Field label="Customers">
          <input type="number" step="1" value={customers} onChange={(e) => setCustomers(e.target.value)} className={input} />
        </Field>
        <Field label="ARR (USD)">
          <input type="number" step="1000" value={arr} onChange={(e) => setArr(e.target.value)} className={input} />
        </Field>
        <Field label="Notes" className="md:col-span-4">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Material wins, blockers, asks — anything worth surfacing in the next LP letter."
            className={`${input} resize-y`}
          />
        </Field>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button" onClick={submit} disabled={busy}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
        >
          {busy
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            : <><Plus className="w-4 h-4" /> Add snapshot</>}
        </button>
        <span className="text-[11px] text-muted-foreground">
          Runway auto-derives from cash / burn if not provided.
        </span>
      </div>
    </section>
  )
}

/** Pull four ordered (chronological) numeric series out of the snapshot history. */
function buildTrends(history: KpiSnapshot[]) {
  const sorted = [...history].sort((a, b) => a.month_end.localeCompare(b.month_end))
  const months = sorted.map((s) => s.month_end)
  const pick = (k: keyof KpiSnapshot) =>
    sorted.map((s) => {
      const v = s[k]
      return typeof v === "number" ? v : null
    })
  return {
    months,
    revenue:   { months, values: pick("monthly_revenue") as (number | null)[] },
    cash:      { months, values: pick("cash_balance")    as (number | null)[] },
    burn:      { months, values: pick("monthly_burn")    as (number | null)[] },
    headcount: { months, values: pick("headcount")       as (number | null)[] },
  }
}

interface Series { months: string[]; values: (number | null)[] }

/** Minimal inline-SVG sparkline. Skips null points (gap) so partial series
 *  still render. ~60px tall, full row width. */
function Sparkline({
  label, series, formatter,
}: { label: string; series: Series; formatter: (n: number) => string }) {
  const cleaned = series.values
    .map((v, i) => ({ v, m: series.months[i] }))
    .filter((p) => typeof p.v === "number" && Number.isFinite(p.v as number)) as Array<{ v: number; m: string }>

  if (cleaned.length < 2) {
    return (
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="w-24 shrink-0 font-mono uppercase tracking-wider text-[10px]">{label}</div>
        <div className="flex-1 italic">no data yet</div>
      </div>
    )
  }

  const vs = cleaned.map((p) => p.v)
  const min = Math.min(...vs)
  const max = Math.max(...vs)
  const span = max - min || 1
  const w = 260
  const h = 36
  const pad = 2
  const n = cleaned.length
  const points = cleaned.map((p, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(1, n - 1)
    const y = h - pad - ((p.v - min) / span) * (h - pad * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  const last = cleaned[cleaned.length - 1]
  const first = cleaned[0]
  const delta = first.v ? ((last.v - first.v) / Math.abs(first.v)) * 100 : null
  const trendColor = last.v >= first.v ? "stroke-emerald-500" : "stroke-rose-500"

  return (
    <div className="flex items-center gap-3 text-xs">
      <div className="w-24 shrink-0 font-mono uppercase tracking-wider text-[10px] text-muted-foreground">
        {label}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="flex-1 h-9">
        <polyline
          points={points.join(" ")}
          fill="none"
          className={`${trendColor}`}
          strokeWidth="1.5"
        />
      </svg>
      <div className="w-28 shrink-0 text-right">
        <div className="font-mono text-foreground">{formatter(last.v)}</div>
        {delta != null && Number.isFinite(delta) && (
          <div className={`font-mono text-[10px] ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
            {delta >= 0 ? "+" : ""}{delta.toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  )
}

function numOrNull(v: string): number | null {
  if (!v) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function shortUsd(n: number): string {
  if (!n) return "$0"
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return USD.format(n)
}
