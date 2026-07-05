"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { ToolField, ToolKpi, ToolNote, ToolShell } from "./tool-shell"
import { compute, type EcommerceForecastInputs } from "@/lib/tools/ecommerce-forecast"

const DEFAULT_STATE: EcommerceForecastInputs = {
  months: 36,
  startingNewCustomers: 300,
  startingGrowthRate: 0.10,
  growthRateDecay: -0.002,
  aovFirstOrder: 65,
  aovRepeatOrder: 80,
  aovMonthlyDrift: 0.002,
  costOfSalesPct: 0.42,
  cosMonthlyDrift: -0.001,
  shippingRevenuePerOrder: 4,
  shippingCostPerOrder: 7.5,
  cacPerNewCustomer: 38,
  retentionCostPerOrder: 3,
  cacMonthlyDrift: 0.003,
  repeatRate: 0.35,
  repeatCycleMonths: 2,
  conversionRate: 0.025,
}

export function EcommerceForecastTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<EcommerceForecastInputs>(DEFAULT_STATE)
  const r = useMemo(() => compute(state), [state])

  const ltvTone = r.ltvToCac >= 3 ? "good" : r.ltvToCac >= 2 ? "warn" : "bad"
  const cmTone = r.contributionMarginPct >= 0.15 ? "good" : r.contributionMarginPct >= 0.08 ? "warn" : "bad"
  // Show every 3rd month in the table to keep it readable
  const tableRows = r.rows.filter((row) => row.month % 3 === 0 || row.month === 1)

  return (
    <ToolShell
      slug="ecommerce-forecast"
      eyebrow="Ecommerce Forecast"
      title="Orders, cohorts, contribution."
      description="Channel-level DTC model — new-customer acquisition, repeat-order cohorts, AOV & COGS drift, shipping economics, contribution margin. xlsx export."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Acquisition</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="New customers, month 1">
              <Input type="number" value={state.startingNewCustomers}
                onChange={(e) => setState({ ...state, startingNewCustomers: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Horizon (months)">
              <Input type="number" value={state.months ?? 36}
                onChange={(e) => setState({ ...state, months: +e.target.value || 36 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Starting growth" unit={`${((state.startingGrowthRate ?? 0.1) * 100).toFixed(0)}%/mo`}>
              <input type="range" min={0} max={30} step={1}
                value={(state.startingGrowthRate ?? 0.1) * 100}
                onChange={(e) => setState({ ...state, startingGrowthRate: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="CAC / new customer" unit="USD">
              <Input type="number" value={state.cacPerNewCustomer}
                onChange={(e) => setState({ ...state, cacPerNewCustomer: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <h2 className="font-display text-xl pt-2">Orders & retention</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="AOV, first order" unit="USD">
              <Input type="number" value={state.aovFirstOrder}
                onChange={(e) => setState({ ...state, aovFirstOrder: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="AOV, repeat order" unit="USD">
              <Input type="number" value={state.aovRepeatOrder}
                onChange={(e) => setState({ ...state, aovRepeatOrder: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Repeat rate" unit={`${((state.repeatRate ?? 0.35) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={80} step={5}
                value={(state.repeatRate ?? 0.35) * 100}
                onChange={(e) => setState({ ...state, repeatRate: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Repeat cycle (months)">
              <Input type="number" value={state.repeatCycleMonths ?? 2}
                onChange={(e) => setState({ ...state, repeatCycleMonths: +e.target.value || 2 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <h2 className="font-display text-xl pt-2">Margins & shipping</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Cost of sales" unit={`${((state.costOfSalesPct ?? 0.42) * 100).toFixed(0)}%`}>
              <input type="range" min={10} max={80} step={1}
                value={(state.costOfSalesPct ?? 0.42) * 100}
                onChange={(e) => setState({ ...state, costOfSalesPct: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Retention cost / repeat order" unit="USD">
              <Input type="number" value={state.retentionCostPerOrder ?? 3}
                onChange={(e) => setState({ ...state, retentionCostPerOrder: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Shipping revenue / order" unit="USD">
              <Input type="number" value={state.shippingRevenuePerOrder ?? 4}
                onChange={(e) => setState({ ...state, shippingRevenuePerOrder: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Shipping cost / order" unit="USD">
              <Input type="number" value={state.shippingCostPerOrder ?? 7.5}
                onChange={(e) => setState({ ...state, shippingCostPerOrder: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label="ARR run-rate" value={`$${(r.finalAnnualRunRate / 1e6).toFixed(2)}M`} sub="final month × 12" />
            <ToolKpi label="LTV : CAC" value={`${r.ltvToCac.toFixed(2)}×`} sub={`LTV $${r.ltv.toFixed(0)} · CAC $${(state.cacPerNewCustomer ?? 38).toFixed(0)}`} tone={ltvTone as any} />
            <ToolKpi label="Contribution margin" value={`${(r.contributionMarginPct * 100).toFixed(1)}%`} sub="after COGS, shipping, marketing" tone={cmTone as any} />
            <ToolKpi label="Orders / customer" value={r.ordersPerCustomer.toFixed(2)} sub={`AOV $${r.avgOrderValue.toFixed(0)}`} />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Monthly model (every 3rd month)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Month</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">New cust.</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Repeat ord.</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Revenue</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Gross profit</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Marketing</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row) => (
                    <tr key={row.month} className="border-t border-foreground/5">
                      <td className="p-2 font-mono">M{row.month}</td>
                      <td className="p-2 font-mono text-right">{Math.round(row.newCustomers).toLocaleString()}</td>
                      <td className="p-2 font-mono text-right">{Math.round(row.repeatOrders).toLocaleString()}</td>
                      <td className="p-2 font-mono text-right">${(row.totalRevenue / 1e3).toFixed(0)}K</td>
                      <td className="p-2 font-mono text-right">${(row.grossProfit / 1e3).toFixed(0)}K</td>
                      <td className="p-2 font-mono text-right">${(row.marketingSpend / 1e3).toFixed(0)}K</td>
                      <td className={`p-2 font-mono text-right ${row.contributionProfit >= 0 ? "text-emerald-700" : "text-destructive"}`}>
                        ${(row.contributionProfit / 1e3).toFixed(0)}K
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ToolKpi label="Total revenue" value={`$${(r.totalRevenue / 1e6).toFixed(2)}M`} sub={`${r.rows.length}-month horizon`} />
            <ToolKpi label="Customers acquired" value={Math.round(r.totalCustomers).toLocaleString()} sub={`${Math.round(r.totalOrders).toLocaleString()} orders`} />
            <ToolKpi label="Total contribution" value={`$${(r.totalContribution / 1e6).toFixed(2)}M`} sub="before fixed opex" />
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
