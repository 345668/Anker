"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Check } from "lucide-react"
import type { SpvEconomics } from "@/lib/modules/spv-economics"
import { computeWaterfall, distributeToInvestors, type CapTableRow } from "@/lib/modules/waterfall"

const money = (v: number) => {
  const sign = v < 0 ? "-" : ""
  const a = Math.abs(v)
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}K`
  return `${sign}$${Math.round(a).toLocaleString()}`
}
const pct = (f: number) => `${(f * 100).toFixed(1)}%`
const moic = (v: number) => `${v.toFixed(2)}×`

export function SpvWaterfallClient({
  spvId, spvName, dealName, economics, capTable,
}: {
  spvId: string
  spvName: string
  dealName: string | null
  economics: SpvEconomics
  capTable: CapTableRow[]
}) {
  const contributed = economics.contributed
  const [carry, setCarry] = useState(String(economics.carry_pct))
  const [hurdle, setHurdle] = useState(String(economics.hurdle_pct))
  const [savedTerms, setSavedTerms] = useState({ carry: economics.carry_pct, hurdle: economics.hurdle_pct })
  const [savingTerms, setSavingTerms] = useState(false)
  const [proceeds, setProceeds] = useState(contributed > 0 ? contributed * 3 : 0)

  const carryN = Number(carry) || 0
  const hurdleN = Number(hurdle) || 0
  const termsDirty = carryN !== savedTerms.carry || hurdleN !== savedTerms.hurdle

  const wf = useMemo(() => computeWaterfall(contributed, proceeds, carryN, hurdleN), [contributed, proceeds, carryN, hurdleN])
  const perInvestor = useMemo(() => distributeToInvestors(capTable, wf), [capTable, wf])

  async function saveTerms() {
    setSavingTerms(true)
    try {
      const res = await fetch(`/api/spvs/${spvId}/terms`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ carryPct: carryN, hurdlePct: hurdleN }),
      })
      const d = await res.json()
      if (d.economics) { setSavedTerms({ carry: d.economics.carry_pct, hurdle: d.economics.hurdle_pct }); setCarry(String(d.economics.carry_pct)); setHurdle(String(d.economics.hurdle_pct)) }
    } finally { setSavingTerms(false) }
  }

  const MULTIPLES = [0.5, 1, 2, 3, 5]
  const maxSlider = Math.max(contributed * 5, 1)

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <Link href={`/dashboard/spvs/${spvId}`} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> {spvName}
      </Link>

      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
          <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> Cap table &amp; waterfall{dealName ? ` · ${dealName}` : ""}
        </div>
        <h1 className="text-3xl font-display tracking-tight">{spvName}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ownership by contributed capital, and a distribution model for a modeled exit.</p>
      </div>

      {contributed <= 0 ? (
        <div className="rounded-lg border border-foreground/10 p-6 text-sm text-muted-foreground">
          No contributed capital yet. Move investors to <strong>committed</strong>, <strong>signed</strong>, or <strong>funded</strong> on the{" "}
          <Link href={`/dashboard/spvs/${spvId}`} className="text-[#2f45e0] hover:underline">SPV book</Link> to build the cap table.
        </div>
      ) : (
        <>
          {/* Economics terms */}
          <section className="mb-8 border border-foreground/10 rounded-xl p-5">
            <h2 className="font-display text-lg tracking-tight mb-4">Economics</h2>
            <div className="grid sm:grid-cols-3 gap-4 items-end">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Carry %</span>
                <input value={carry} onChange={(e) => setCarry(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="inpW tabular-nums" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Preferred return (hurdle) %</span>
                <input value={hurdle} onChange={(e) => setHurdle(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="inpW tabular-nums" />
              </label>
              <button onClick={saveTerms} disabled={savingTerms || !termsDirty}
                className="inline-flex items-center justify-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40">
                {savingTerms ? <Loader2 className="w-4 h-4 animate-spin" /> : termsDirty ? null : <Check className="w-4 h-4" />}
                {termsDirty ? "Save terms" : "Saved"}
              </button>
            </div>
          </section>

          {/* Exit modeler */}
          <section className="mb-8">
            <h2 className="font-display text-lg tracking-tight mb-3">Model an exit</h2>
            <div className="border border-foreground/10 rounded-xl p-5">
              <div className="flex flex-wrap items-center gap-3 mb-4">
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Exit proceeds</span>
                  <input
                    value={Math.round(proceeds)}
                    onChange={(e) => setProceeds(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)}
                    inputMode="decimal"
                    className="inpW tabular-nums w-40"
                  />
                </label>
                <div className="flex items-center gap-1.5">
                  {MULTIPLES.map((m) => (
                    <button key={m} onClick={() => setProceeds(contributed * m)}
                      className={`h-8 px-2.5 text-xs rounded-md border transition-colors ${Math.abs(proceeds - contributed * m) < 1 ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-muted-foreground hover:border-foreground/40"}`}>
                      {m}×
                    </button>
                  ))}
                </div>
                <span className="ml-auto text-sm text-muted-foreground">Gross <span className="text-foreground font-medium tabular-nums">{moic(wf.grossMoic)}</span> · LP net <span className="text-foreground font-medium tabular-nums">{moic(wf.lpMoic)}</span></span>
              </div>

              <input type="range" min={0} max={maxSlider} step={maxSlider / 200} value={proceeds}
                onChange={(e) => setProceeds(Number(e.target.value))} className="w-full accent-[#2f45e0]" />

              {/* Split summary */}
              <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
                <Split label="Return of capital" value={money(wf.returnOfCapital)} />
                <Split label="LP preferred" value={money(wf.lpPreferred)} hide={hurdleN <= 0} />
                <Split label="LP profit share" value={money(wf.lpProfitShare)} />
                <Split label="GP carry" value={money(wf.gpCarry)} accent />
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-muted-foreground">LP total <span className="text-foreground font-medium tabular-nums">{money(wf.lpTotal)}</span></span>
                <span className="text-muted-foreground">GP total <span className="text-foreground font-medium tabular-nums">{money(wf.gpTotal)}</span></span>
                <span className="text-muted-foreground">Profit <span className="text-foreground font-medium tabular-nums">{money(wf.profit)}</span></span>
              </div>
            </div>
          </section>

          {/* Cap table + per-investor distribution */}
          <section>
            <h2 className="font-display text-lg tracking-tight mb-3">Cap table &amp; distribution</h2>
            <div className="overflow-x-auto border border-foreground/10 rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                    <th className="text-left px-4 py-2.5">Investor</th>
                    <th className="text-right px-4 py-2.5">Contributed</th>
                    <th className="text-right px-4 py-2.5">Ownership</th>
                    <th className="text-right px-4 py-2.5">Distribution</th>
                    <th className="text-right px-4 py-2.5">Gain</th>
                    <th className="text-right px-4 py-2.5">MOIC</th>
                  </tr>
                </thead>
                <tbody>
                  {perInvestor.map((r) => (
                    <tr key={r.investor} className="border-b border-foreground/[0.06] last:border-0">
                      <td className="px-4 py-2.5 font-medium">{r.investor}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(r.contributed)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{pct(r.ownership)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{money(r.distribution)}</td>
                      <td className={`px-4 py-2.5 text-right tabular-nums ${r.gain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>{money(r.gain)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{moic(r.moic)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-foreground/10 font-medium">
                    <td className="px-4 py-2.5">Total</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(contributed)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">100%</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(wf.lpTotal)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{money(wf.lpTotal - contributed)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{moic(wf.lpMoic)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Single-tier carry with an optional preferred return, no GP catch-up. LP distributions are pro-rata by contributed capital.
            </p>
          </section>
        </>
      )}

      <style>{`.inpW{height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inpW:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}

function Split({ label, value, accent, hide }: { label: string; value: string; accent?: boolean; hide?: boolean }) {
  if (hide) return null
  return (
    <div className={`rounded-lg border p-3.5 ${accent ? "border-[#2f45e0]/30 bg-[#2f45e0]/[0.04]" : "border-foreground/10"}`}>
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-lg font-display tabular-nums">{value}</div>
    </div>
  )
}
