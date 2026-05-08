"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { ToolField, ToolKpi, ToolNote, ToolShell } from "./tool-shell"
import { compute, type VcFundModelInputs } from "@/lib/tools/vc-fund-model"

const DEFAULT_STATE: VcFundModelInputs = {
  fundSizeUsd: 100_000_000,
  fundLifeYears: 10,
  investmentPeriodYears: 4,
  reservePeriodYears: 6,
  reserveRatio: 0.40,
  numInitialInvestments: 25,
  followOnMultipleOnInitial: 1.5,
  followOnHitRate: 0.50,
  firstExitYear: 5,
  annualExitFraction: 0.15,
  avgExitMultiple: 5.0,
  annualMarkupRate: 1.20,
  mgmtFeePct: 0.02,
  feeBase: "auto",
  carriedInterestPct: 0.20,
  hurdlePct: 0,
}

export function VcFundModelTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<VcFundModelInputs>(DEFAULT_STATE)
  const r = useMemo(() => compute(state), [state])

  const grossTone = r.grossMoic >= 3 ? "good" : r.grossMoic >= 2 ? "warn" : "bad"
  const netTone   = r.netIrr >= 0.20 ? "good" : r.netIrr >= 0.12 ? "warn" : "bad"

  return (
    <ToolShell
      slug="vc-fund-model"
      eyebrow="VC Fund Model"
      title="Pacing, reserves, returns."
      description="Top-down annual fund forecast — pacing, reserves, follow-ons, mark-ups, exits. Outputs MOIC / TVPI / DPI / IRR (gross & net). xlsx export."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Fund structure</h2>

          <ToolField label="Fund size" unit="USD">
            <Input type="number" value={state.fundSizeUsd}
              onChange={(e) => setState({ ...state, fundSizeUsd: +e.target.value || 0 })}
              className="h-10 font-mono" />
          </ToolField>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Fund life (yrs)">
              <Input type="number" value={state.fundLifeYears ?? 10}
                onChange={(e) => setState({ ...state, fundLifeYears: +e.target.value || 10 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Investment period (yrs)">
              <Input type="number" value={state.investmentPeriodYears ?? 4}
                onChange={(e) => setState({ ...state, investmentPeriodYears: +e.target.value || 4 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="# of initial investments">
              <Input type="number" value={state.numInitialInvestments ?? 25}
                onChange={(e) => setState({ ...state, numInitialInvestments: +e.target.value || 25 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Reserve ratio" unit={`${((state.reserveRatio ?? 0.4) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={70} step={5}
                value={(state.reserveRatio ?? 0.4) * 100}
                onChange={(e) => setState({ ...state, reserveRatio: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Follow-on multiple" unit={`${(state.followOnMultipleOnInitial ?? 1.5).toFixed(2)}×`}>
              <input type="range" min={50} max={500} step={10}
                value={(state.followOnMultipleOnInitial ?? 1.5) * 100}
                onChange={(e) => setState({ ...state, followOnMultipleOnInitial: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Follow-on hit rate" unit={`${((state.followOnHitRate ?? 0.5) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={100} step={5}
                value={(state.followOnHitRate ?? 0.5) * 100}
                onChange={(e) => setState({ ...state, followOnHitRate: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <h2 className="font-display text-xl pt-2">Returns assumptions</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="First exit year">
              <Input type="number" value={state.firstExitYear ?? 5}
                onChange={(e) => setState({ ...state, firstExitYear: +e.target.value || 5 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Annual exit %" unit={`${((state.annualExitFraction ?? 0.15) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={50} step={5}
                value={(state.annualExitFraction ?? 0.15) * 100}
                onChange={(e) => setState({ ...state, annualExitFraction: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Avg exit multiple" unit={`${(state.avgExitMultiple ?? 5).toFixed(1)}×`}>
              <input type="range" min={10} max={200} step={5}
                value={(state.avgExitMultiple ?? 5) * 10}
                onChange={(e) => setState({ ...state, avgExitMultiple: +e.target.value / 10 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Annual mark-up" unit={`${(((state.annualMarkupRate ?? 1.2) - 1) * 100).toFixed(0)}%`}>
              <input type="range" min={100} max={150} step={2}
                value={(state.annualMarkupRate ?? 1.2) * 100}
                onChange={(e) => setState({ ...state, annualMarkupRate: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <h2 className="font-display text-xl pt-2">Fees & carry</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Mgmt fee" unit={`${((state.mgmtFeePct ?? 0.02) * 100).toFixed(2)}%`}>
              <input type="range" min={0} max={300} step={5}
                value={(state.mgmtFeePct ?? 0.02) * 10000}
                onChange={(e) => setState({ ...state, mgmtFeePct: +e.target.value / 10000 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Carry" unit={`${((state.carriedInterestPct ?? 0.2) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={30} step={1}
                value={(state.carriedInterestPct ?? 0.2) * 100}
                onChange={(e) => setState({ ...state, carriedInterestPct: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label="Gross MOIC" value={`${r.grossMoic.toFixed(2)}×`} sub="distributions ÷ invested" tone={grossTone as any} />
            <ToolKpi label="Net IRR"    value={`${(r.netIrr * 100).toFixed(1)}%`} sub="LP IRR after fees + carry" tone={netTone as any} />
            <ToolKpi label="Final DPI"  value={`${r.finalDpi.toFixed(2)}×`} sub="cash returned ÷ called" />
            <ToolKpi label="Initial check" value={`$${(r.effectiveCheckSize / 1e6).toFixed(2)}M`} sub={`${state.numInitialInvestments ?? 25} initial deals`} />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Annual cashflow + NAV</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Year</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Called</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Initial</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Follow-on</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Exits</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">EOY NAV</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">DPI</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">TVPI</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row, i) => (
                    <tr key={i} className="border-t border-foreground/5">
                      <td className="p-2 font-mono">Y{row.year}</td>
                      <td className="p-2 font-mono text-right">${(row.capitalCalled / 1e6).toFixed(1)}M</td>
                      <td className="p-2 font-mono text-right">${(row.capitalInvested / 1e6).toFixed(1)}M</td>
                      <td className="p-2 font-mono text-right">${(row.followOnInvested / 1e6).toFixed(1)}M</td>
                      <td className="p-2 font-mono text-right text-emerald-700">{row.exitsCash > 0 ? `$${(row.exitsCash / 1e6).toFixed(1)}M` : "—"}</td>
                      <td className="p-2 font-mono text-right">${(row.unrealizedNav / 1e6).toFixed(1)}M</td>
                      <td className="p-2 font-mono text-right">{row.dpi.toFixed(2)}×</td>
                      <td className="p-2 font-mono text-right">{row.tvpi.toFixed(2)}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ToolKpi label="Total invested" value={`$${(r.totalInvested / 1e6).toFixed(1)}M`} sub="initial + follow-on" />
            <ToolKpi label="Total distributions" value={`$${(r.totalDistributed / 1e6).toFixed(1)}M`} sub="incl. wind-down NAV" />
            <ToolKpi label="Mgmt fees + carry" value={`$${((r.totalMgmtFees + r.totalCarry) / 1e6).toFixed(1)}M`} sub={`${(r.totalMgmtFees / 1e6).toFixed(1)}M fees · ${(r.totalCarry / 1e6).toFixed(1)}M carry`} />
          </div>

          {r.notes.length > 0 && (
            <div className="space-y-2">
              {r.notes.map((n, i) => <ToolNote key={i}>{n}</ToolNote>)}
            </div>
          )}
        </>
      }
    />
  )
}
