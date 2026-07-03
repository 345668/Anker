"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { ToolField, ToolKpi, ToolNote, ToolShell } from "./tool-shell"
import { compute, type EnterpriseSaasInputs } from "@/lib/tools/enterprise-saas-forecast"

const DEFAULT_STATE: EnterpriseSaasInputs = {
  months: 36,
  startingPipelinePerMonth: 10,
  pipelineGrowthRate: 0.06,
  winRate: 0.20,
  salesCycleMonths: 3,
  acvUsd: 60_000,
  contractLengthMonths: 12,
  billingCadence: "annual",
  renewalChurnRate: 0.10,
  expansionOnRenewal: 0.10,
  grossMarginPct: 0.78,
  cacPerDealUsd: 45_000,
}

export function EnterpriseSaasForecastTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<EnterpriseSaasInputs>(DEFAULT_STATE)
  const r = useMemo(() => compute(state), [state])

  const paybackTone = r.cacPaybackMonths <= 18 ? "good" : r.cacPaybackMonths <= 24 ? "warn" : "bad"
  const magicTone = r.magicNumber >= 0.75 ? "good" : r.magicNumber >= 0.5 ? "warn" : "bad"
  const tableRows = r.rows.filter((row) => row.month % 3 === 0 || row.month === 1)

  return (
    <ToolShell
      slug="enterprise-saas-forecast"
      eyebrow="Enterprise SaaS Forecast"
      title="Pipeline, bookings, ARR."
      description="Sales-led model — funnel to closed-won, ACV contracts, bookings → billings → recognized revenue with a deferred-revenue roll-forward (ASC 606). xlsx export."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Pipeline & funnel</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Opps created / month">
              <Input type="number" value={state.startingPipelinePerMonth}
                onChange={(e) => setState({ ...state, startingPipelinePerMonth: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Pipeline growth" unit={`${((state.pipelineGrowthRate ?? 0.06) * 100).toFixed(0)}%/mo`}>
              <input type="range" min={0} max={20} step={1}
                value={(state.pipelineGrowthRate ?? 0.06) * 100}
                onChange={(e) => setState({ ...state, pipelineGrowthRate: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Win rate" unit={`${((state.winRate ?? 0.2) * 100).toFixed(0)}%`}>
              <input type="range" min={5} max={50} step={1}
                value={(state.winRate ?? 0.2) * 100}
                onChange={(e) => setState({ ...state, winRate: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Sales cycle (months)">
              <Input type="number" value={state.salesCycleMonths ?? 3}
                onChange={(e) => setState({ ...state, salesCycleMonths: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <h2 className="font-display text-xl pt-2">Contracts</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="ACV" unit="USD/yr">
              <Input type="number" value={state.acvUsd}
                onChange={(e) => setState({ ...state, acvUsd: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Contract length (months)">
              <Input type="number" value={state.contractLengthMonths ?? 12}
                onChange={(e) => setState({ ...state, contractLengthMonths: +e.target.value || 12 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <ToolField label="Billing cadence">
            <select
              value={state.billingCadence ?? "annual"}
              onChange={(e) => setState({ ...state, billingCadence: e.target.value as EnterpriseSaasInputs["billingCadence"] })}
              className="w-full h-10 px-3 rounded-md border border-input bg-background font-mono text-sm"
            >
              <option value="upfront">Upfront (full TCV)</option>
              <option value="annual">Annual</option>
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
            </select>
          </ToolField>

          <h2 className="font-display text-xl pt-2">Retention & efficiency</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Logo churn at renewal" unit={`${((state.renewalChurnRate ?? 0.1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={40} step={1}
                value={(state.renewalChurnRate ?? 0.1) * 100}
                onChange={(e) => setState({ ...state, renewalChurnRate: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Expansion on renewal" unit={`+${((state.expansionOnRenewal ?? 0.1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={50} step={1}
                value={(state.expansionOnRenewal ?? 0.1) * 100}
                onChange={(e) => setState({ ...state, expansionOnRenewal: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Gross margin" unit={`${((state.grossMarginPct ?? 0.78) * 100).toFixed(0)}%`}>
              <input type="range" min={40} max={95} step={1}
                value={(state.grossMarginPct ?? 0.78) * 100}
                onChange={(e) => setState({ ...state, grossMarginPct: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="CAC / closed deal" unit="USD">
              <Input type="number" value={state.cacPerDealUsd ?? 45_000}
                onChange={(e) => setState({ ...state, cacPerDealUsd: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label="Final ARR" value={`$${(r.finalArr / 1e6).toFixed(2)}M`} sub={`month ${r.rows.length}`} />
            <ToolKpi label="CAC payback" value={`${r.cacPaybackMonths.toFixed(1)} mo`} sub="on gross margin" tone={paybackTone as any} />
            <ToolKpi label="Magic number" value={r.magicNumber.toFixed(2)} sub="net-new ARR / S&M, last 12 mo" tone={magicTone as any} />
            <ToolKpi label="Clients won" value={Math.round(r.totalClients).toLocaleString()} sub={`ACV $${((state.acvUsd ?? 60000) / 1e3).toFixed(0)}K`} />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Bookings → billings → revenue (every 3rd month)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Month</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Deals won</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Bookings</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Billings</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Revenue</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Deferred</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">ARR</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.month} className="border-t border-foreground/5">
                      <td className="p-2 font-mono">M{row.month}</td>
                      <td className="p-2 font-mono text-right">{row.dealsWon.toFixed(1)}</td>
                      <td className="p-2 font-mono text-right">${(row.bookings / 1e3).toFixed(0)}K</td>
                      <td className="p-2 font-mono text-right">${(row.billings / 1e3).toFixed(0)}K</td>
                      <td className="p-2 font-mono text-right">${(row.recognizedRevenue / 1e3).toFixed(0)}K</td>
                      <td className="p-2 font-mono text-right">${(row.deferredEnd / 1e3).toFixed(0)}K</td>
                      <td className="p-2 font-mono text-right text-emerald-700">${(row.arr / 1e6).toFixed(2)}M</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ToolKpi label="Total bookings" value={`$${(r.totalBookings / 1e6).toFixed(2)}M`} sub="TCV signed" />
            <ToolKpi label="Recognized revenue" value={`$${(r.totalRecognized / 1e6).toFixed(2)}M`} sub="over horizon" />
            <ToolKpi label="Deferred revenue, end" value={`$${(r.finalDeferred / 1e6).toFixed(2)}M`} sub="billed, not yet recognized" />
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
