"use client"

/**
 * Investments — position book + NAV of record.
 *
 * Three zones:
 *   1. Performance header: NAV, TVPI / DPI / RVPI, gross MOIC, net IRR —
 *      all computed server-side from positions + paid call/distribution
 *      lines (lib/portfolio/investments.getFundPerformance).
 *   2. Positions table: every investment with cost, latest mark, method,
 *      unrealized multiple. Inline "Mark" opens a snapshot mini-form.
 *   3. "New position" panel — the manual entry path until the deal
 *      pipeline's close action (Phase 2) starts writing these rows.
 */

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Plus, Loader2, TrendingUp, AlertTriangle,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type {
  InvestmentFull, FundPerformance, InvestmentKind, SecurityType, ValuationMethod,
} from "@/lib/portfolio/investments"
import { DataTable, type Column } from "@/components/data/data-table"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"

interface Props {
  fund: FundFull
  initialInvestments: InvestmentFull[]
  performance: FundPerformance | null
  tablesReady: boolean
}

const KINDS: { v: InvestmentKind; l: string }[] = [
  { v: "initial", l: "Initial" }, { v: "follow_on", l: "Follow-on" },
  { v: "studio_common", l: "Studio common" }, { v: "secondary", l: "Secondary" },
  { v: "bridge", l: "Bridge" }, { v: "other", l: "Other" },
]
const SECURITIES: { v: SecurityType; l: string }[] = [
  { v: "preferred", l: "Preferred" }, { v: "safe", l: "SAFE" },
  { v: "convertible_note", l: "Convertible note" }, { v: "common", l: "Common" },
  { v: "warrant", l: "Warrant" }, { v: "other", l: "Other" },
]
const METHODS: { v: ValuationMethod; l: string }[] = [
  { v: "mark", l: "Mark" }, { v: "last_round", l: "Last round" },
  { v: "cost", l: "Cost" }, { v: "write_down", l: "Write-down" },
  { v: "write_off", l: "Write-off" }, { v: "exit", l: "Exit" },
]

const usd = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: digits })}`
const mult = (n: number | null | undefined) => (n == null ? "—" : `${n.toFixed(2)}×`)
const pct = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`)

export function InvestmentsClient({ fund, initialInvestments, performance, tablesReady }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)
  const [savingMark, setSavingMark] = useState(false)

  // Create form
  const [companyName, setCompanyName] = useState("")
  const [kind, setKind] = useState<InvestmentKind>("initial")
  const [security, setSecurity] = useState<SecurityType>("preferred")
  const [roundName, setRoundName] = useState("")
  const [investedAt, setInvestedAt] = useState("")
  const [costBasis, setCostBasis] = useState("")
  const [fdPct, setFdPct] = useState("")

  // Mark form
  const [markValue, setMarkValue] = useState("")
  const [markMethod, setMarkMethod] = useState<ValuationMethod>("mark")
  const [markDate, setMarkDate] = useState(new Date().toISOString().slice(0, 10))
  const [markNote, setMarkNote] = useState("")

  const nav = performance?.nav ?? null

  async function createPosition() {
    if (!companyName.trim()) { setError("Company name required"); return }
    const cost = Number(costBasis)
    if (!Number.isFinite(cost) || cost < 0) { setError("Cost basis must be ≥ 0"); return }
    setCreating(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/investments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          investmentKind: kind,
          securityType: security,
          roundName: roundName.trim() || null,
          investedAt: investedAt || null,
          costBasis: cost,
          fullyDilutedPct: fdPct ? Number(fdPct) / 100 : null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Create failed (${res.status})`)
      setShowCreate(false)
      setCompanyName(""); setRoundName(""); setInvestedAt(""); setCostBasis(""); setFdPct("")
      router.refresh()
    } catch (e: any) { setError(e?.message ?? "Create failed") }
    finally { setCreating(false) }
  }

  async function saveMark(inv: InvestmentFull) {
    const fv = Number(markValue)
    if (!Number.isFinite(fv) || fv < 0) { setError("Fair value must be ≥ 0"); return }
    setSavingMark(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/investments/${inv.id}/valuations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          asOfDate: markDate,
          fairValue: fv,
          method: markMethod,
          note: markNote.trim() || null,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Mark failed (${res.status})`)
      setMarkingId(null); setMarkValue(""); setMarkNote("")
      router.refresh()
    } catch (e: any) { setError(e?.message ?? "Mark failed") }
    finally { setSavingMark(false) }
  }

  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
          <Link
            href="/dashboard/portfolio/fund"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            {fund.name}
          </Link>
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-3">
                <span className="w-8 h-px bg-foreground/30" />
                Investments · NAV of record
              </span>
              <h1 className="text-4xl lg:text-5xl font-display tracking-tight leading-[0.95]">
                Position book.
              </h1>
            </div>
            <button
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 rounded-full h-11 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm"
            >
              <Plus className="w-4 h-4" />
              New position
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10 space-y-8">
        {!tablesReady && (
          <div className="flex items-start gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              The investments tables haven&apos;t been created yet. Run{" "}
              <code className="font-mono text-xs bg-foreground/10 px-1.5 py-0.5 rounded">
                NEON_DATABASE_URL=… node scripts/oneshot/run-investments-tables.mjs
              </code>{" "}
              against the database, then reload.
            </span>
          </div>
        )}

        {error && (
          <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Performance header — Carta metric tiles */}
        <MetricTiles
          columns={3}
          metrics={[
            { label: "Fund NAV", value: usd(nav?.positionsFairValue), hint: nav ? `${nav.activePositionCount} active positions` : "run migration" },
            { label: "TVPI", value: mult(performance?.tvpi), hint: "DPI + RVPI" },
            { label: "DPI", value: mult(performance?.dpi), hint: `distributed ${usd(performance?.totalDistributed)}` },
            { label: "RVPI", value: mult(performance?.rvpi), hint: `called ${usd(performance?.totalCalled)}` },
            { label: "Gross MOIC", value: mult(performance?.grossMoic), hint: `invested ${usd(nav?.totalInvested)}` },
            { label: "Net IRR", value: pct(performance?.netIrr), hint: "from dated cashflows" },
          ] as Metric[]}
        />

        {/* Create panel */}
        {showCreate && (
          <div className="border border-foreground/10 rounded-lg p-6 space-y-4">
            <h3 className="font-display text-lg">New position</h3>
            <div className="grid md:grid-cols-3 gap-4">
              <Field label="Company name *">
                <input value={companyName} onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" />
              </Field>
              <Field label="Kind">
                <select value={kind} onChange={(e) => setKind(e.target.value as InvestmentKind)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono">
                  {KINDS.map((k) => <option key={k.v} value={k.v}>{k.l}</option>)}
                </select>
              </Field>
              <Field label="Security">
                <select value={security} onChange={(e) => setSecurity(e.target.value as SecurityType)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono">
                  {SECURITIES.map((s) => <option key={s.v} value={s.v}>{s.l}</option>)}
                </select>
              </Field>
              <Field label="Round">
                <input value={roundName} onChange={(e) => setRoundName(e.target.value)} placeholder="Seed, Series A…"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm" />
              </Field>
              <Field label="Invested date">
                <input type="date" value={investedAt} onChange={(e) => setInvestedAt(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
              </Field>
              <Field label="Cost basis (USD) *">
                <input type="number" value={costBasis} onChange={(e) => setCostBasis(e.target.value)}
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
              </Field>
              <Field label="Fully-diluted %">
                <input type="number" step="0.01" value={fdPct} onChange={(e) => setFdPct(e.target.value)} placeholder="e.g. 8.5"
                  className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground">
              The position is seeded with a valuation snapshot at cost, so NAV updates immediately.
            </p>
            <div className="flex gap-3">
              <button onClick={createPosition} disabled={creating}
                className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                Create position
              </button>
              <button onClick={() => setShowCreate(false)} className="text-sm text-muted-foreground hover:text-foreground">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Schedule of investments — Carta DataTable */}
        <div>
          <DataTable
            rows={initialInvestments}
            getRowId={(inv) => inv.id}
            exportName="schedule-of-investments"
            searchPlaceholder="Search positions…"
            initialSort={{ key: "current_fair_value", dir: "desc" }}
            emptyText="No positions yet. Add the fund's first investment above."
            columns={[
              { key: "company_name", header: "Company", value: (inv) => inv.company_name, render: (inv) => (
                <span className={inv.status !== "active" ? "opacity-60" : ""}>
                  <span className="font-medium">{inv.company_name}</span>
                  {inv.status !== "active" && <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">{inv.status.replace("_", " ")}</span>}
                </span>
              ) },
              { key: "investment_kind", header: "Kind", value: (inv) => inv.investment_kind, render: (inv) => <span className="text-muted-foreground">{inv.investment_kind.replace("_", " ")}</span> },
              { key: "round_name", header: "Round", value: (inv) => inv.round_name ?? "", render: (inv) => inv.round_name ?? "—" },
              { key: "invested_at", header: "Invested", value: (inv) => inv.invested_at ?? "", render: (inv) => inv.invested_at ?? "—" },
              { key: "cost_basis", header: "Cost", numeric: true, value: (inv) => Number(inv.cost_basis), render: (inv) => usd(inv.cost_basis), total: (rs) => usd(rs.reduce((s, i) => s + Number(i.cost_basis || 0), 0)) },
              { key: "current_fair_value", header: "Fair value", numeric: true, value: (inv) => Number(inv.current_fair_value ?? inv.cost_basis), render: (inv) => usd(inv.current_fair_value), total: (rs) => usd(rs.reduce((s, i) => s + Number(i.current_fair_value ?? i.cost_basis ?? 0), 0)) },
              { key: "current_value_method", header: "Method", value: (inv) => inv.current_value_method ?? "", render: (inv) => <span className="text-muted-foreground text-xs font-mono">{inv.current_value_method ?? "—"}</span>, defaultHidden: true },
              { key: "fully_diluted_pct", header: "Ownership", numeric: true, value: (inv) => Number(inv.fully_diluted_pct ?? 0), render: (inv) => (inv.fully_diluted_pct != null ? `${Number(inv.fully_diluted_pct).toFixed(1)}%` : "—") },
              { key: "multiple", header: "Multiple", numeric: true, value: (inv) => { const fv = inv.current_fair_value ?? inv.cost_basis; return inv.cost_basis > 0 ? fv / inv.cost_basis : 0 }, render: (inv) => {
                const fv = inv.current_fair_value ?? inv.cost_basis
                const m = inv.cost_basis > 0 ? fv / inv.cost_basis : null
                return <span className={m != null && m > 1 ? "text-emerald-600 font-medium" : m != null && m < 1 ? "text-rose-600 font-medium" : ""}>{mult(m)}</span>
              } },
              { key: "action", header: "", sortable: false, value: () => "", render: (inv) => inv.status === "active" ? (
                <button
                  onClick={() => { const fv = inv.current_fair_value ?? inv.cost_basis; setMarkingId(markingId === inv.id ? null : inv.id); setMarkValue(String(fv)); setError(null) }}
                  className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
                  type="button"
                ><TrendingUp className="w-3.5 h-3.5" /> Mark</button>
              ) : null },
            ] as Column<InvestmentFull>[]}
          />

          {/* Mark mini-form */}
          {markingId && (() => {
            const inv = initialInvestments.find((i) => i.id === markingId)
            if (!inv) return null
            return (
              <div className="border-t border-foreground/10 bg-foreground/[0.02] p-4 flex flex-wrap items-end gap-3">
                <span className="text-sm font-medium mr-2">Mark {inv.company_name}:</span>
                <Field label="Fair value (USD)">
                  <input type="number" value={markValue} onChange={(e) => setMarkValue(e.target.value)}
                    className="h-9 w-40 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </Field>
                <Field label="Method">
                  <select value={markMethod} onChange={(e) => setMarkMethod(e.target.value as ValuationMethod)}
                    className="h-9 px-2 rounded-md border border-input bg-background text-sm font-mono">
                    {METHODS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                  </select>
                </Field>
                <Field label="As of">
                  <input type="date" value={markDate} onChange={(e) => setMarkDate(e.target.value)}
                    className="h-9 px-3 rounded-md border border-input bg-background text-sm font-mono" />
                </Field>
                <Field label="Note">
                  <input value={markNote} onChange={(e) => setMarkNote(e.target.value)} placeholder="e.g. Series B priced round"
                    className="h-9 w-64 px-3 rounded-md border border-input bg-background text-sm" />
                </Field>
                <button onClick={() => saveMark(inv)} disabled={savingMark}
                  className="inline-flex items-center gap-2 rounded-full h-9 px-4 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
                  {savingMark && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save mark
                </button>
                <button onClick={() => setMarkingId(null)} className="text-sm text-muted-foreground hover:text-foreground h-9">
                  Cancel
                </button>
              </div>
            )
          })()}
        </div>

        {nav && nav.activePositionCount > nav.markedPositionCount && (
          <p className="text-xs text-muted-foreground">
            {nav.activePositionCount - nav.markedPositionCount} active position(s) have no valuation
            snapshot yet and are carried at cost in NAV.
          </p>
        )}
      </div>
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="p-4 border border-foreground/10 rounded-lg">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="text-xl font-display">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}
