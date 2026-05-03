"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToolField, ToolKpi, ToolNote, ToolShell } from "./tool-shell"
import { compute, sensitivityGrid, type UnitEconomicsInputs } from "@/lib/tools/unit-economics"

export function UnitEconomicsTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<UnitEconomicsInputs>({
    arpaMonthly: 99,
    grossMargin: 0.78,
    monthlyChurn: 0.02,
    cac: 850,
    expansionRate: 0.005,
  })

  const result = useMemo(() => compute(state), [state])
  const sens = useMemo(() => sensitivityGrid(state), [state])

  const tone = result.health === "great" ? "good" : result.health === "good" ? "good" : result.health === "marginal" ? "warn" : "bad"

  return (
    <ToolShell
      slug="unit-economics"
      eyebrow="Unit Economics"
      title="LTV : CAC, payback."
      description="Cohort-based unit-economics calculator. Adjust ARPA, churn, gross margin, and CAC; see LTV, payback, and a sensitivity grid update live. Export to xlsx."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Inputs</h2>

          <ToolField label="ARPA (monthly)" unit="USD">
            <Input type="number" value={state.arpaMonthly} onChange={(e) => setState({ ...state, arpaMonthly: +e.target.value })} className="h-10 font-mono" />
          </ToolField>

          <ToolField label="Gross margin" unit={`${(state.grossMargin * 100).toFixed(0)}%`}>
            <Slider value={[state.grossMargin * 100]} max={100} step={1} onValueChange={(v) => setState({ ...state, grossMargin: v[0] / 100 })} />
          </ToolField>

          <ToolField label="Monthly logo churn" unit={`${(state.monthlyChurn * 100).toFixed(2)}%`}>
            <Slider value={[state.monthlyChurn * 1000]} max={150} step={1} onValueChange={(v) => setState({ ...state, monthlyChurn: v[0] / 1000 })} />
          </ToolField>

          <ToolField label="Monthly expansion (rev growth on existing)" unit={`${((state.expansionRate ?? 0) * 100).toFixed(2)}%`}>
            <Slider value={[(state.expansionRate ?? 0) * 1000]} max={50} step={1} onValueChange={(v) => setState({ ...state, expansionRate: v[0] / 1000 })} />
          </ToolField>

          <ToolField label="CAC — cost to acquire" unit="USD">
            <Input type="number" value={state.cac} onChange={(e) => setState({ ...state, cac: +e.target.value })} className="h-10 font-mono" />
          </ToolField>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label="LTV : CAC" value={`${result.ltvCacRatio.toFixed(2)}×`} sub="≥ 3× is venture-grade" tone={tone} />
            <ToolKpi label="Payback" value={isFinite(result.paybackMonths) ? `${result.paybackMonths.toFixed(1)} mo` : "∞"} sub="≤ 12 mo is great" tone={result.paybackMonths <= 12 ? "good" : result.paybackMonths <= 18 ? "warn" : "bad"} />
            <ToolKpi label="LTV" value={`$${Math.round(result.ltv).toLocaleString()}`} sub={`@ ${result.customerLifetimeMonths.toFixed(0)}-mo lifetime`} />
            <ToolKpi label="Monthly contribution" value={`$${result.monthlyContribution.toFixed(0)}`} sub="ARPA × gross margin" />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Sensitivity: LTV : CAC by churn × CAC</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>{sens.headers.map((h, i) => <th key={i} className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {sens.rows.map((r, i) => (
                    <tr key={i} className="border-t border-foreground/5">
                      {r.map((c, j) => <td key={j} className={j === 0 ? "p-2 font-mono text-muted-foreground" : "p-2 font-mono"}>{c}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {result.notes.length > 0 && (
            <div className="space-y-2">
              {result.notes.map((n, i) => <ToolNote key={i}>{n}</ToolNote>)}
            </div>
          )}
        </>
      }
    />
  )
}
