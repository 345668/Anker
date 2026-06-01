"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToolField, ToolKpi, ToolShell } from "./tool-shell"
import { compute, type VentureValuationInputs } from "@/lib/tools/venture-valuation"

export function VentureValuationTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<VentureValuationInputs>({
    currentRevenue: 5_000_000,
    dcfYears: 5,
    growthRateYears1to3: 0.6,
    growthRateYears4to5: 0.3,
    fcfMargin: 0.15,
    discountRate: 0.20,
    terminalGrowthRate: 0.03,
    peerRevMultiple: 8,
    exitYearRevenue: 50_000_000,
    exitMultiple: 6,
    targetIrr: 0.30,
    yearsToExit: 5,
    netDebt: 0,
    fullyDilutedShares: 10_000_000,
  })

  const r = useMemo(() => compute(state), [state])
  const fmtM = (n: number) => `$${(n / 1e6).toFixed(1)}M`

  return (
    <ToolShell
      slug="venture-valuation"
      eyebrow="Venture Valuation · 3 methods"
      title="Three lenses, one number."
      description="DCF + comparables + venture method. Each method runs independently; the summary shows the range so you can stress-test against your target round price."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Inputs</h2>
          <NumField label="Current annual revenue (USD)" value={state.currentRevenue} onChange={(n) => setState({ ...state, currentRevenue: n })} />

          <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground pt-2">DCF</h3>
          <ToolField label="Growth — yrs 1-3" unit={`${(state.growthRateYears1to3 * 100).toFixed(0)}%`}>
            <Slider value={[state.growthRateYears1to3 * 100]} max={150} step={1} onValueChange={(v) => setState({ ...state, growthRateYears1to3: v[0] / 100 })} />
          </ToolField>
          <ToolField label="Growth — yrs 4-5" unit={`${(state.growthRateYears4to5 * 100).toFixed(0)}%`}>
            <Slider value={[state.growthRateYears4to5 * 100]} max={100} step={1} onValueChange={(v) => setState({ ...state, growthRateYears4to5: v[0] / 100 })} />
          </ToolField>
          <ToolField label="FCF margin" unit={`${(state.fcfMargin * 100).toFixed(0)}%`}>
            <Slider value={[state.fcfMargin * 100]} max={50} step={1} onValueChange={(v) => setState({ ...state, fcfMargin: v[0] / 100 })} />
          </ToolField>
          <ToolField label="Discount rate" unit={`${(state.discountRate * 100).toFixed(0)}%`}>
            <Slider value={[state.discountRate * 100]} min={5} max={50} step={1} onValueChange={(v) => setState({ ...state, discountRate: v[0] / 100 })} />
          </ToolField>
          <ToolField label="Terminal growth" unit={`${(state.terminalGrowthRate * 100).toFixed(1)}%`}>
            <Slider value={[state.terminalGrowthRate * 100]} max={6} step={0.5} onValueChange={(v) => setState({ ...state, terminalGrowthRate: v[0] / 100 })} />
          </ToolField>

          <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground pt-2">Comps</h3>
          <ToolField label="Peer revenue multiple" unit={`${state.peerRevMultiple.toFixed(1)}×`}>
            <Slider value={[state.peerRevMultiple]} max={30} step={0.5} onValueChange={(v) => setState({ ...state, peerRevMultiple: v[0] })} />
          </ToolField>

          <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground pt-2">Venture method</h3>
          <NumField label="Exit-year revenue (USD)" value={state.exitYearRevenue} onChange={(n) => setState({ ...state, exitYearRevenue: n })} />
          <ToolField label="Exit multiple" unit={`${state.exitMultiple.toFixed(1)}×`}>
            <Slider value={[state.exitMultiple]} max={20} step={0.5} onValueChange={(v) => setState({ ...state, exitMultiple: v[0] })} />
          </ToolField>
          <ToolField label="Target IRR" unit={`${(state.targetIrr * 100).toFixed(0)}%`}>
            <Slider value={[state.targetIrr * 100]} max={80} step={1} onValueChange={(v) => setState({ ...state, targetIrr: v[0] / 100 })} />
          </ToolField>
          <NumField label="Years to exit" value={state.yearsToExit} onChange={(n) => setState({ ...state, yearsToExit: n })} />

          <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground pt-2">Allocation</h3>
          <NumField label="Net debt (USD)" value={state.netDebt} onChange={(n) => setState({ ...state, netDebt: n })} />
          <NumField label="Fully-diluted shares" value={state.fullyDilutedShares} onChange={(n) => setState({ ...state, fullyDilutedShares: n })} />
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-3 gap-4">
            <ToolKpi label="DCF — equity" value={fmtM(r.dcf.equityValue)} sub={`$${r.dcf.perShare.toFixed(2)}/share`} />
            <ToolKpi label="Comps — equity" value={fmtM(r.comps.equityValue)} sub={`$${r.comps.perShare.toFixed(2)}/share`} />
            <ToolKpi label="Venture method" value={fmtM(r.venture.equityValue)} sub={`$${r.venture.perShare.toFixed(2)}/share`} />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Range</h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Low</div>
                <div className="text-3xl font-display">{fmtM(r.blended.low)}</div>
              </div>
              <div className="border-x border-foreground/10">
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">Average</div>
                <div className="text-3xl font-display">{fmtM(r.blended.avgEquityValue)}</div>
              </div>
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">High</div>
                <div className="text-3xl font-display">{fmtM(r.blended.high)}</div>
              </div>
            </div>
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">DCF detail (5-year)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>{["Year", "Revenue", "FCF", "PV factor", "PV"].map((h) => (
                    <th key={h} className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {r.dcf.years.map((y) => (
                    <tr key={y.year} className="border-t border-foreground/5 font-mono">
                      <td className="p-2">{y.year}</td>
                      <td className="p-2">${(y.revenue / 1e6).toFixed(2)}M</td>
                      <td className="p-2">${(y.fcf / 1e6).toFixed(2)}M</td>
                      <td className="p-2">{y.pvFactor.toFixed(3)}</td>
                      <td className="p-2">${(y.pv / 1e6).toFixed(2)}M</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-foreground/20 font-mono font-medium">
                    <td className="p-2">Terminal</td>
                    <td className="p-2"></td>
                    <td className="p-2">${(r.dcf.terminalValue / 1e6).toFixed(2)}M</td>
                    <td className="p-2"></td>
                    <td className="p-2">${(r.dcf.pvOfTerminal / 1e6).toFixed(2)}M</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </>
      }
    />
  )
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <ToolField label={label}>
      <Input type="number" value={value} onChange={(e) => onChange(+e.target.value)} className="h-10 font-mono" />
    </ToolField>
  )
}
