"use client"

import { useMemo, useState } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { ToolField, ToolKpi, ToolShell } from "./tool-shell"
import { compute, type SaasForecastInputs } from "@/lib/tools/saas-forecast"

export function SaasForecastTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<SaasForecastInputs>({
    startingCustomers: 25,
    startingMrr: 5_000,
    newCustomersM1: 8,
    newCustomersM60: 80,
    arpaMonthly: 200,
    monthlyChurn: 0.025,
    monthlyExpansion: 0.01,
    grossMargin: 0.78,
    monthsHorizon: 60,
  })

  const r = useMemo(() => compute(state), [state])
  const chartData = r.rows.map((row) => ({
    month: `M${row.month}`,
    MRR: Math.round(row.mrr),
    Customers: row.customers,
  }))

  return (
    <ToolShell
      slug="saas-forecast"
      eyebrow="SaaS Forecast · 60 months"
      title="From MRR to ARR."
      description="Cohort-based monthly forecast: new customers ramp, churn, expansion, gross margin. Outputs ARR, customer count, cumulative gross profit."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Inputs</h2>
          <NumField label="Starting customers" value={state.startingCustomers} onChange={(n) => setState({ ...state, startingCustomers: n })} />
          <NumField label="Starting MRR (USD)" value={state.startingMrr} onChange={(n) => setState({ ...state, startingMrr: n })} />
          <NumField label="ARPA monthly (USD)" value={state.arpaMonthly} onChange={(n) => setState({ ...state, arpaMonthly: n })} />
          <NumField label="New customers — month 1" value={state.newCustomersM1} onChange={(n) => setState({ ...state, newCustomersM1: n })} />
          <NumField label={`New customers — month ${state.monthsHorizon ?? 60}`} value={state.newCustomersM60} onChange={(n) => setState({ ...state, newCustomersM60: n })} />
          <ToolField label="Monthly logo churn" unit={`${(state.monthlyChurn * 100).toFixed(2)}%`}>
            <Slider value={[state.monthlyChurn * 1000]} max={150} step={1} onValueChange={(v) => setState({ ...state, monthlyChurn: v[0] / 1000 })} />
          </ToolField>
          <ToolField label="Monthly expansion (existing)" unit={`${(state.monthlyExpansion * 100).toFixed(2)}%`}>
            <Slider value={[state.monthlyExpansion * 1000]} max={50} step={1} onValueChange={(v) => setState({ ...state, monthlyExpansion: v[0] / 1000 })} />
          </ToolField>
          <ToolField label="Gross margin" unit={`${(state.grossMargin * 100).toFixed(0)}%`}>
            <Slider value={[state.grossMargin * 100]} max={100} step={1} onValueChange={(v) => setState({ ...state, grossMargin: v[0] / 100 })} />
          </ToolField>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label={`ARR @ M${state.monthsHorizon ?? 60}`} value={`$${(r.totals.finalArr / 1e6).toFixed(2)}M`} />
            <ToolKpi label={`Customers @ M${state.monthsHorizon ?? 60}`} value={r.totals.finalCustomers.toLocaleString()} />
            <ToolKpi label="Cumulative revenue" value={`$${(r.totals.cumulativeRevenue / 1e6).toFixed(1)}M`} />
            <ToolKpi label="Cumulative gross profit" value={`$${(r.totals.cumulativeGrossProfit / 1e6).toFixed(1)}M`} />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">MRR over time</h3>
            <div className="h-72">
              <ResponsiveContainer>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="m" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.15 0.01 270)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="oklch(0.15 0.01 270)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="oklch(0.90 0 0)" vertical={false} />
                  <XAxis dataKey="month" stroke="oklch(0.45 0.01 270)" fontSize={10} />
                  <YAxis stroke="oklch(0.45 0.01 270)" fontSize={11} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}K`} />
                  <Tooltip
                    formatter={(v: number) => `$${v.toLocaleString()}`}
                    contentStyle={{ background: "oklch(0.99 0 0)", border: "1px solid oklch(0.90 0 0)", borderRadius: 8, fontFamily: "var(--font-mono)", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="MRR" stroke="oklch(0.15 0.01 270)" fill="url(#m)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">First 12 months</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>{["Month", "New", "Customers", "MRR", "ARR", "Churn $"].map((h) => (
                    <th key={h} className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {r.rows.slice(0, 12).map((row) => (
                    <tr key={row.month} className="border-t border-foreground/5 font-mono">
                      <td className="p-2">M{row.month}</td>
                      <td className="p-2">{row.newCustomers}</td>
                      <td className="p-2">{row.customers}</td>
                      <td className="p-2">${Math.round(row.mrr).toLocaleString()}</td>
                      <td className="p-2">${Math.round(row.arr).toLocaleString()}</td>
                      <td className="p-2 text-destructive">−${Math.round(row.churnedMrr).toLocaleString()}</td>
                    </tr>
                  ))}
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
