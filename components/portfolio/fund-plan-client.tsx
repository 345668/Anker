"use client"

/**
 * Plan vs. actual — the calculators as the planning layer:
 *
 *   1. Plan editor: the VC Fund Model's key assumptions, saved on the
 *      fund (funds.metadata.plan) and re-computed deterministically.
 *   2. Reserve status: initial vs. follow-on budgets against actual
 *      deployment + committed pipeline — the same numbers the deal
 *      workroom's allocation check uses.
 *   3. Year-by-year table: plan (called / deployed / distributed / NAV)
 *      vs. actuals from the record, with cumulative pacing %.
 */

import Link from "next/link"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Save, AlertTriangle } from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type { PlanVsActual } from "@/lib/portfolio/plan-actual"

interface Props {
  fund: FundFull
  initial: PlanVsActual
}

const usd = (n: number | null | undefined) =>
  n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`
const m = (n: number | null | undefined) =>
  n == null ? "—" : n === 0 ? "—" : `$${(n / 1e6).toFixed(1)}M`

export function FundPlanClient({ fund, initial }: Props) {
  const router = useRouter()
  const [pva, setPva] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const p = pva.plan
  const [fundSize, setFundSize] = useState(String(p?.fundSizeUsd ?? fund.target_size ?? 50_000_000))
  const [life, setLife] = useState(String(p?.fundLifeYears ?? fund.term_years ?? 10))
  const [investYears, setInvestYears] = useState(String(p?.investmentPeriodYears ?? fund.investment_period_years ?? 4))
  const [reserve, setReserve] = useState(String(((p?.reserveRatio ?? 0.4) * 100)))
  const [numDeals, setNumDeals] = useState(String(p?.numInitialInvestments ?? 25))
  const [firstExit, setFirstExit] = useState(String(p?.firstExitYear ?? 5))
  const [exitMult, setExitMult] = useState(String(p?.avgExitMultiple ?? 5))
  const [markup, setMarkup] = useState(String((((p?.annualMarkupRate ?? 1.2) - 1) * 100)))

  async function save() {
    setSaving(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/plan`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fundSizeUsd: Number(fundSize) || 0,
          fundLifeYears: Number(life) || 10,
          investmentPeriodYears: Number(investYears) || 4,
          reserveRatio: (Number(reserve) || 40) / 100,
          numInitialInvestments: Number(numDeals) || 25,
          firstExitYear: Number(firstExit) || 5,
          avgExitMultiple: Number(exitMult) || 5,
          annualMarkupRate: 1 + (Number(markup) || 20) / 100,
          mgmtFeePct: fund.management_fee_pct ?? 0.02,
          carriedInterestPct: fund.carry_pct ?? 0.20,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      setPva(data.planVsActual)
      router.refresh()
    } catch (e: any) { setError(e?.message ?? "Save failed") }
    finally { setSaving(false) }
  }

  const r = pva.reserve
  const h = pva.headline

  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-10">
          <Link href="/dashboard/portfolio/fund"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" />
            {fund.name}
          </Link>
          <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-3">
            <span className="w-8 h-px bg-foreground/30" />
            Plan vs actual · fund year {h.currentFundYear}
          </span>
          <h1 className="text-4xl lg:text-5xl font-display tracking-tight leading-[0.95]">
            The plan, checked.
          </h1>
        </div>
      </div>

      <div className="max-w-[1400px] mx-auto px-6 lg:px-12 py-8 space-y-6">
        {error && (
          <div className="p-3 rounded-md border border-destructive/30 bg-destructive/5 text-sm text-destructive">{error}</div>
        )}
        {pva.notes.map((n, i) => (
          <div key={i} className="flex items-start gap-2 p-3 rounded-md border border-amber-500/20 bg-amber-500/5 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>{n}</span>
          </div>
        ))}

        {/* Headline */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Kpi label="Called (actual)" v={m(h.actualCalled)} />
          <Kpi label="Deployed (actual)" v={m(h.actualDeployed)} />
          <Kpi label="Distributed (actual)" v={m(h.actualDistributed)} />
          <Kpi label="NAV (record)" v={m(h.actualNav)} />
          <Kpi label="Plan TVPI (final)" v={h.planTvpi != null ? `${h.planTvpi.toFixed(2)}×` : "—"}
            sub={h.currentTvpiOnPlanTimeline != null ? `plan says ${h.currentTvpiOnPlanTimeline.toFixed(2)}× by now` : undefined} />
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Plan editor */}
          <div className="border border-foreground/10 rounded-lg p-5 space-y-3 h-fit">
            <h3 className="font-display text-lg">Fund plan (model assumptions)</h3>
            <div className="grid grid-cols-2 gap-3">
              <F label="Fund size (USD)"><Inp v={fundSize} set={setFundSize} /></F>
              <F label="Fund life (yrs)"><Inp v={life} set={setLife} /></F>
              <F label="Investment period (yrs)"><Inp v={investYears} set={setInvestYears} /></F>
              <F label="Reserve ratio %"><Inp v={reserve} set={setReserve} /></F>
              <F label="# initial deals"><Inp v={numDeals} set={setNumDeals} /></F>
              <F label="First exit year"><Inp v={firstExit} set={setFirstExit} /></F>
              <F label="Avg exit multiple"><Inp v={exitMult} set={setExitMult} /></F>
              <F label="Annual mark-up %"><Inp v={markup} set={setMarkup} /></F>
            </div>
            <button onClick={save} disabled={saving}
              className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {pva.hasPlan ? "Update plan" : "Save plan"}
            </button>
            <p className="text-[11px] text-muted-foreground">
              Fee ({((fund.management_fee_pct ?? 0.02) * 100).toFixed(1)}%) and carry
              ({((fund.carry_pct ?? 0.2) * 100).toFixed(0)}%) come from the fund record.
              The full model lives in the{" "}
              <Link href="/dashboard/tools/vc-fund-model" className="underline">VC Fund Model tool</Link>.
            </p>
          </div>

          {/* Reserve status */}
          <div className="lg:col-span-2 space-y-6">
            {r && (
              <div className="border border-foreground/10 rounded-lg p-5">
                <h3 className="font-display text-lg mb-4">Reserve policy vs deployment</h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <Budget label={`Initial checks · ${(100 - r.reserveRatio * 100).toFixed(0)}% of fund`}
                    used={r.initialUsed} budget={r.initialBudget}
                    extra={r.committedPipeline > 0 ? `${usd(r.committedPipeline)} committed in pipeline` : undefined}
                    danger={r.uncommittedInitial < 0} />
                  <Budget label={`Follow-on reserve · ${(r.reserveRatio * 100).toFixed(0)}% of fund`}
                    used={r.followOnUsed} budget={r.reserveBudget} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  Uncommitted initial budget:{" "}
                  <span className={`font-mono ${r.uncommittedInitial < 0 ? "text-destructive" : "text-emerald-700"}`}>
                    {usd(r.uncommittedInitial)}
                  </span>{" "}
                  — this is what the deal workroom checks a proposed check against.
                </p>
              </div>
            )}

            {/* Plan vs actual table */}
            {pva.hasPlan && (
              <div className="border border-foreground/10 rounded-lg overflow-hidden">
                <div className="px-4 py-2 border-b border-foreground/10 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Year by year · plan vs actual (from {pva.startYear})
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-foreground/5">
                      <tr>
                        <th className="p-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Year</th>
                        <th className="p-2 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Called P / A</th>
                        <th className="p-2 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Deployed P / A</th>
                        <th className="p-2 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Distributed P / A</th>
                        <th className="p-2 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Plan NAV</th>
                        <th className="p-2 text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Pacing</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pva.rows.map((row) => {
                        const isCurrent = row.calendarYear === new Date().getFullYear()
                        const aDeployed = row.actual.deployedInitial + row.actual.deployedFollowOn
                        return (
                          <tr key={row.year} className={`border-t border-foreground/5 ${isCurrent ? "bg-foreground/[0.03]" : ""}`}>
                            <td className="p-2 font-mono">Y{row.year} · {row.calendarYear}{isCurrent ? " ←" : ""}</td>
                            <td className="p-2 font-mono text-right">{m(row.plan.called)} / <b>{m(row.actual.called)}</b></td>
                            <td className="p-2 font-mono text-right">{m(row.plan.deployed)} / <b>{m(aDeployed)}</b></td>
                            <td className="p-2 font-mono text-right">{m(row.plan.distributed)} / <b>{m(row.actual.distributed)}</b></td>
                            <td className="p-2 font-mono text-right">{m(row.plan.nav)}</td>
                            <td className={`p-2 font-mono text-right ${
                              row.pacingPct == null ? "text-muted-foreground"
                              : row.pacingPct < 60 || row.pacingPct > 140 ? "text-amber-700" : "text-emerald-700"
                            }`}>
                              {row.pacingPct != null ? `${row.pacingPct}%` : "—"}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  )
}

function Inp({ v, set }: { v: string; set: (s: string) => void }) {
  return (
    <input type="number" value={v} onChange={(e) => set(e.target.value)}
      className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm font-mono" />
  )
}

function Kpi({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div className="p-4 rounded-lg border border-foreground/10">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="font-display text-xl">{v}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

function Budget({ label, used, budget, extra, danger }: {
  label: string; used: number; budget: number; extra?: string; danger?: boolean
}) {
  const pct = budget > 0 ? Math.min(1, used / budget) : 0
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-medium">{label}</span>
        <span className="font-mono text-xs text-muted-foreground">{usd(used)} / {usd(budget)}</span>
      </div>
      <div className="h-2 rounded bg-foreground/10 overflow-hidden">
        <div className={`h-full ${danger || pct > 1 ? "bg-destructive" : pct > 0.85 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct * 100}%` }} />
      </div>
      {extra && <div className="mt-1 text-[11px] text-amber-700">{extra}</div>}
    </div>
  )
}
