"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ToolKpi, ToolShell } from "./tool-shell"
import { computeInvestment, rollupFund, type VcInvestment } from "@/lib/tools/vc-performance"

const SEED: VcInvestment[] = [
  { fund: "Fund I", company: "Acme Robotics", sector: "Robotics", vintage: 2019, invested: 1_500_000, distributed: 6_200_000, unrealizedNav: 0 },
  { fund: "Fund I", company: "PaperPlane HR", sector: "SaaS", vintage: 2020, invested: 1_000_000, distributed: 0, unrealizedNav: 4_500_000 },
  { fund: "Fund I", company: "Lattice Bio", sector: "Biotech", vintage: 2020, invested: 2_000_000, distributed: 0, unrealizedNav: 6_000_000 },
  { fund: "Fund I", company: "Quill", sector: "AI/ML", vintage: 2021, invested: 750_000, distributed: 0, unrealizedNav: 1_200_000 },
  { fund: "Fund II", company: "Voltic Health", sector: "HealthTech", vintage: 2024, invested: 2_500_000, distributed: 0, unrealizedNav: 4_000_000 },
  { fund: "Fund II", company: "Northwind", sector: "Fintech", vintage: 2024, invested: 1_500_000, distributed: 0, unrealizedNav: 1_800_000 },
  { fund: "Fund II", company: "GroveCanvas", sector: "Consumer", vintage: 2025, invested: 800_000, distributed: 0, unrealizedNav: 950_000 },
]

export function VcPerformanceTool() {
  const [exporting, setExporting] = useState(false)
  const [investments, setInvestments] = useState<VcInvestment[]>(SEED)

  const computed = useMemo(() => investments.map(computeInvestment), [investments])
  const rollups = useMemo(() => rollupFund(computed), [computed])
  const totals = useMemo(() => {
    const inv = computed.reduce((a, b) => a + b.invested, 0)
    const dist = computed.reduce((a, b) => a + b.distributed, 0)
    const nav = computed.reduce((a, b) => a + b.unrealizedNav, 0)
    return {
      invested: inv,
      distributed: dist,
      nav,
      tvpi: inv > 0 ? (dist + nav) / inv : 0,
      dpi: inv > 0 ? dist / inv : 0,
    }
  }, [computed])

  const update = (i: number, patch: Partial<VcInvestment>) =>
    setInvestments((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)))
  const remove = (i: number) => setInvestments((prev) => prev.filter((_, idx) => idx !== i))
  const add = () =>
    setInvestments((prev) => [...prev, { fund: "Fund II", company: "New investment", vintage: new Date().getFullYear(), invested: 0, distributed: 0, unrealizedNav: 0 }])

  const fmtM = (n: number) => `$${(n / 1e6).toFixed(2)}M`

  return (
    <ToolShell
      slug="vc-performance"
      eyebrow="VC Performance · MOIC / DPI / TVPI"
      title="The fund, by the numbers."
      description="Per-investment performance with fund-level rollup. MOIC, DPI, TVPI, and (when cashflows are present) IRR. Edit any cell — totals recalc instantly."
      state={{ investments }}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Portfolio</h2>
          <p className="text-xs text-muted-foreground">{investments.length} investments across {rollups.length} fund(s)</p>
          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-2">
            {investments.map((inv, i) => (
              <div key={i} className="p-3 border border-foreground/10 rounded-md space-y-2">
                <div className="flex items-center gap-2">
                  <Input value={inv.company} onChange={(e) => update(i, { company: e.target.value })} className="h-8 text-sm" />
                  <button onClick={() => remove(i)} className="p-1.5 text-muted-foreground hover:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input value={inv.fund} onChange={(e) => update(i, { fund: e.target.value })} placeholder="Fund" className="h-8 text-xs font-mono" />
                  <Input type="number" value={inv.vintage} onChange={(e) => update(i, { vintage: +e.target.value })} placeholder="Vintage" className="h-8 text-xs font-mono" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input type="number" value={inv.invested} onChange={(e) => update(i, { invested: +e.target.value })} placeholder="Invested" className="h-8 text-xs font-mono" />
                  <Input type="number" value={inv.distributed} onChange={(e) => update(i, { distributed: +e.target.value })} placeholder="Distributed" className="h-8 text-xs font-mono" />
                  <Input type="number" value={inv.unrealizedNav} onChange={(e) => update(i, { unrealizedNav: +e.target.value })} placeholder="NAV" className="h-8 text-xs font-mono" />
                </div>
              </div>
            ))}
          </div>
          <Button onClick={add} variant="outline" size="sm" className="w-full gap-1.5 rounded-full">
            <Plus className="w-3.5 h-3.5" /> Add investment
          </Button>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label="Invested" value={fmtM(totals.invested)} />
            <ToolKpi label="Distributed" value={fmtM(totals.distributed)} />
            <ToolKpi label="NAV" value={fmtM(totals.nav)} />
            <ToolKpi label="TVPI" value={`${totals.tvpi.toFixed(2)}×`} sub={`DPI ${totals.dpi.toFixed(2)}×`} tone={totals.tvpi >= 3 ? "good" : totals.tvpi >= 1 ? "neutral" : "bad"} />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Fund rollup</h3>
            <table className="w-full text-sm">
              <thead className="bg-foreground/5">
                <tr>{["Fund", "Investments", "Invested", "Distributed", "NAV", "MOIC", "DPI", "TVPI"].map((h) => (
                  <th key={h} className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground text-xs">{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {rollups.map((r) => (
                  <tr key={r.fund} className="border-t border-foreground/5 font-mono text-xs">
                    <td className="p-2 font-medium">{r.fund}</td>
                    <td className="p-2">{r.investments}</td>
                    <td className="p-2">{fmtM(r.invested)}</td>
                    <td className="p-2">{fmtM(r.distributed)}</td>
                    <td className="p-2">{fmtM(r.nav)}</td>
                    <td className="p-2">{r.moic.toFixed(2)}×</td>
                    <td className="p-2">{r.dpi.toFixed(2)}×</td>
                    <td className="p-2">{r.tvpi.toFixed(2)}×</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Per-investment</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>{["Company", "Fund", "Vintage", "Invested", "Distributed", "NAV", "MOIC"].map((h) => (
                    <th key={h} className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {computed.sort((a, b) => b.moic - a.moic).map((i, k) => (
                    <tr key={k} className="border-t border-foreground/5 font-mono">
                      <td className="p-2 font-medium">{i.company}</td>
                      <td className="p-2">{i.fund}</td>
                      <td className="p-2">{i.vintage}</td>
                      <td className="p-2">{fmtM(i.invested)}</td>
                      <td className="p-2">{fmtM(i.distributed)}</td>
                      <td className="p-2">{fmtM(i.unrealizedNav)}</td>
                      <td className="p-2 font-medium">{i.moic.toFixed(2)}×</td>
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
