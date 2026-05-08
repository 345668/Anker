"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ToolField, ToolKpi, ToolNote, ToolShell } from "./tool-shell"
import {
  compute,
  type OpexHire,
  type OpexInputs,
  type OpexVendor,
} from "@/lib/tools/opex-proforma"

const DEFAULT_HIRES: OpexHire[] = [
  { role: "Founder/CEO", department: "G&A", monthlySalary: 8_000, startMonth: 0, loadMultiplier: 1.20 },
  { role: "Founder/CTO", department: "Engineering", monthlySalary: 8_000, startMonth: 0, loadMultiplier: 1.20 },
  { role: "Senior engineer", department: "Engineering", monthlySalary: 14_000, startMonth: 2, loadMultiplier: 1.30 },
  { role: "Engineer", department: "Engineering", monthlySalary: 11_000, startMonth: 6, loadMultiplier: 1.30 },
  { role: "Designer", department: "Engineering", monthlySalary: 10_000, startMonth: 4, loadMultiplier: 1.30 },
  { role: "Founding AE", department: "Sales & Marketing", monthlySalary: 9_000, startMonth: 6, loadMultiplier: 1.30 },
]

const DEFAULT_VENDORS: OpexVendor[] = [
  { name: "AWS / hosting", category: "Infra", monthlyCost: 800, startMonth: 0 },
  { name: "Tooling / SaaS bundle", category: "Software", monthlyCost: 1_200, startMonth: 0 },
  { name: "Legal retainer", category: "Legal", monthlyCost: 2_500, startMonth: 0 },
  { name: "Office / WeWork", category: "Office", monthlyCost: 1_800, startMonth: 0 },
  { name: "Performance marketing", category: "Marketing", monthlyCost: 5_000, startMonth: 6 },
]

const DEFAULT_STATE: OpexInputs = {
  months: 24,
  cashStart: 2_000_000,
  revenuePerMonth: 0,
  hires: DEFAULT_HIRES,
  vendors: DEFAULT_VENDORS,
  oneTime: [
    { description: "Incorporation + IP", category: "Legal", amount: 12_000, month: 0 },
    { description: "Laptops + AV gear", category: "Office", amount: 18_000, month: 0 },
  ],
}

export function OpExProFormaTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<OpexInputs>(DEFAULT_STATE)
  const result = useMemo(() => compute(state), [state])

  function setHires(next: OpexHire[]) { setState({ ...state, hires: next }) }
  function setVendors(next: OpexVendor[]) { setState({ ...state, vendors: next }) }

  const peakHeadcount = result.rows.reduce((m, r) => Math.max(m, r.headcount), 0)
  const y1Opex = result.annualTotals[0]?.opex ?? 0
  const runwayLabel =
    !isFinite(result.runwayMonths) ? "∞ — net positive" :
    result.runwayMonths < 1 ? "< 1 mo" :
    `${result.runwayMonths.toFixed(1)} mo`
  const runwayTone =
    !isFinite(result.runwayMonths) ? "good" :
    result.runwayMonths < 9 ? "bad" :
    result.runwayMonths < 18 ? "warn" :
    "good"

  return (
    <ToolShell
      slug="opex-proforma"
      eyebrow="OpEx Pro-Forma"
      title="Hire roster, run the numbers."
      description="Department-level monthly opex, hire-by-hire roster, vendor lines, P&L roll-up. Cash-runway built in. Export the full 36-month model to xlsx."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Inputs</h2>

          <ToolField label="Projection months">
            <Input type="number" value={state.months ?? 24} min={6} max={60}
              onChange={(e) => setState({ ...state, months: +e.target.value || 24 })}
              className="h-10 font-mono" />
          </ToolField>

          <ToolField label="Cash on hand" unit="USD">
            <Input type="number" value={state.cashStart ?? 0}
              onChange={(e) => setState({ ...state, cashStart: +e.target.value || 0 })}
              className="h-10 font-mono" />
          </ToolField>

          <ToolField label="Monthly revenue" unit="USD">
            <Input type="number" value={state.revenuePerMonth ?? 0}
              onChange={(e) => setState({ ...state, revenuePerMonth: +e.target.value || 0 })}
              className="h-10 font-mono" />
          </ToolField>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-sm">Hire roster</h3>
              <button
                type="button"
                onClick={() => setHires([...state.hires, { role: "New role", department: "Engineering", monthlySalary: 10_000, startMonth: state.months ?? 24 }])}
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {state.hires.map((h, i) => (
                <HireRow
                  key={i}
                  hire={h}
                  onChange={(next) => setHires(state.hires.map((x, j) => j === i ? next : x))}
                  onDelete={() => setHires(state.hires.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          </div>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-sm">Vendor lines</h3>
              <button
                type="button"
                onClick={() => setVendors([...state.vendors, { name: "New vendor", category: "Software", monthlyCost: 500, startMonth: 0 }])}
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {state.vendors.map((v, i) => (
                <VendorRow
                  key={i}
                  vendor={v}
                  onChange={(next) => setVendors(state.vendors.map((x, j) => j === i ? next : x))}
                  onDelete={() => setVendors(state.vendors.filter((_, j) => j !== i))}
                />
              ))}
            </div>
          </div>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label="Peak headcount" value={String(peakHeadcount)} sub={`Year-1 end: ${result.annualTotals[0]?.headcountAtYearEnd ?? "—"}`} />
            <ToolKpi label="Year-1 opex" value={`$${(y1Opex / 1e6).toFixed(2)}M`} sub="Salaries + vendors + one-time" />
            <ToolKpi
              label="Cash runway"
              value={runwayLabel}
              sub={`avg burn ≈ $${Math.round((result.rows[0]?.netBurn ?? 0) / 1000)}k/mo`}
              tone={runwayTone as any}
            />
            <ToolKpi
              label="Year-3 opex"
              value={result.annualTotals[2] ? `$${(result.annualTotals[2].opex / 1e6).toFixed(2)}M` : "—"}
              sub={result.annualTotals[2] ? `headcount ${result.annualTotals[2].headcountAtYearEnd}` : "raise model length to see"}
            />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Department mix at month 12</h3>
            <div className="space-y-2">
              {result.deptMixMonth12.filter((d) => d.opex > 0).map((d, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span>{d.dept}</span>
                    <span className="font-mono text-muted-foreground">
                      ${Math.round(d.opex).toLocaleString()} ({(d.pct * 100).toFixed(0)}%)
                    </span>
                  </div>
                  <div className="h-1.5 bg-foreground/5 rounded overflow-hidden">
                    <div
                      className="h-full bg-foreground transition-all"
                      style={{ width: `${Math.max(2, d.pct * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Monthly P&L (first 12 months)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Month</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">HC</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Salaries</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Vendors</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">One-time</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Total</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Cash</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 12).map((r, i) => (
                    <tr key={i} className="border-t border-foreground/5">
                      <td className="p-2 font-mono text-muted-foreground">M{String(i + 1).padStart(2, "0")}</td>
                      <td className="p-2 font-mono text-right">{r.headcount}</td>
                      <td className="p-2 font-mono text-right">${Math.round(r.totalSalaries).toLocaleString()}</td>
                      <td className="p-2 font-mono text-right">${Math.round(r.totalVendors).toLocaleString()}</td>
                      <td className="p-2 font-mono text-right">{r.oneTime ? `$${Math.round(r.oneTime).toLocaleString()}` : "—"}</td>
                      <td className="p-2 font-mono text-right font-medium">${Math.round(r.totalOpex).toLocaleString()}</td>
                      <td className={`p-2 font-mono text-right ${r.cashBalance < 0 ? "text-rose-600" : ""}`}>
                        ${Math.round(r.cashBalance).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] font-mono text-muted-foreground mt-3">
              Full {result.months}-month detail available in the xlsx export.
            </p>
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

// ─── Row sub-components ───────────────────────────────────────────────────
function HireRow({ hire, onChange, onDelete }: { hire: OpexHire; onChange: (h: OpexHire) => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <input
        className="col-span-4 h-8 px-2 text-xs border border-foreground/10 rounded bg-background"
        value={hire.role}
        onChange={(e) => onChange({ ...hire, role: e.target.value })}
        placeholder="Role"
      />
      <input
        className="col-span-3 h-8 px-2 text-xs border border-foreground/10 rounded bg-background"
        value={hire.department}
        onChange={(e) => onChange({ ...hire, department: e.target.value })}
        placeholder="Dept"
      />
      <input
        type="number"
        className="col-span-2 h-8 px-2 text-xs font-mono text-right border border-foreground/10 rounded bg-background"
        value={hire.monthlySalary}
        onChange={(e) => onChange({ ...hire, monthlySalary: +e.target.value || 0 })}
        placeholder="$/mo"
      />
      <input
        type="number"
        className="col-span-2 h-8 px-2 text-xs font-mono text-right border border-foreground/10 rounded bg-background"
        value={hire.startMonth}
        onChange={(e) => onChange({ ...hire, startMonth: +e.target.value || 0 })}
        placeholder="Start mo"
      />
      <button
        type="button"
        onClick={onDelete}
        className="col-span-1 h-8 inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
        title="Remove"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function VendorRow({ vendor, onChange, onDelete }: { vendor: OpexVendor; onChange: (v: OpexVendor) => void; onDelete: () => void }) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center">
      <input
        className="col-span-4 h-8 px-2 text-xs border border-foreground/10 rounded bg-background"
        value={vendor.name}
        onChange={(e) => onChange({ ...vendor, name: e.target.value })}
        placeholder="Vendor"
      />
      <input
        className="col-span-3 h-8 px-2 text-xs border border-foreground/10 rounded bg-background"
        value={vendor.category}
        onChange={(e) => onChange({ ...vendor, category: e.target.value })}
        placeholder="Category"
      />
      <input
        type="number"
        className="col-span-2 h-8 px-2 text-xs font-mono text-right border border-foreground/10 rounded bg-background"
        value={vendor.monthlyCost}
        onChange={(e) => onChange({ ...vendor, monthlyCost: +e.target.value || 0 })}
        placeholder="$/mo"
      />
      <input
        type="number"
        className="col-span-2 h-8 px-2 text-xs font-mono text-right border border-foreground/10 rounded bg-background"
        value={vendor.startMonth}
        onChange={(e) => onChange({ ...vendor, startMonth: +e.target.value || 0 })}
        placeholder="Start mo"
      />
      <button
        type="button"
        onClick={onDelete}
        className="col-span-1 h-8 inline-flex items-center justify-center text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded"
        title="Remove"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
