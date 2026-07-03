"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { ToolField, ToolKpi, ToolNote, ToolShell } from "./tool-shell"
import { compute, type FundOfFundsInputs } from "@/lib/tools/fund-of-funds"

const DEFAULT_STATE: FundOfFundsInputs = {
  fofSizeUsd: 100_000_000,
  fofLifeYears: 14,
  commitmentPeriodYears: 3,
  numSubFunds: 20,
  fofMgmtFeePct: 0.01,
  fofCarryPct: 0.05,
  fofOrgExpensesUsd: 150_000,
  fofAnnualOpexUsd: 100_000,
  subFundInvestPeriodYears: 4,
  subFundMgmtFeePct: 0.02,
  subFundCarryPct: 0.20,
  pctWriteoff: 0.60,
  pctSmall: 0.20,
  pctMedium: 0.10,
  pctLarge: 0.10,
  firstDistYear: 5,
  distributionYears: 6,
}

export function FundOfFundsTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<FundOfFundsInputs>(DEFAULT_STATE)
  const r = useMemo(() => compute(state), [state])

  const tvpiTone = r.finalTvpi >= 2 ? "good" : r.finalTvpi >= 1.6 ? "warn" : "bad"
  const irrTone = r.netIrr >= 0.12 ? "good" : r.netIrr >= 0.08 ? "warn" : "bad"

  const setMix = (key: "pctWriteoff" | "pctSmall" | "pctMedium" | "pctLarge", v: number) =>
    setState({ ...state, [key]: v / 100 })

  return (
    <ToolShell
      slug="fund-of-funds"
      eyebrow="Fund of Funds"
      title="Twenty managers, one J-curve."
      description="Allocator model — commit to N sub-funds over a window, model their J-curves and fees, aggregate to portfolio DPI / TVPI / net IRR through the double fee layer. xlsx export."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Fund of funds</h2>

          <ToolField label="FoF size" unit="USD">
            <Input type="number" value={state.fofSizeUsd}
              onChange={(e) => setState({ ...state, fofSizeUsd: +e.target.value || 0 })}
              className="h-10 font-mono" />
          </ToolField>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="# of sub-funds">
              <Input type="number" value={state.numSubFunds ?? 20}
                onChange={(e) => setState({ ...state, numSubFunds: +e.target.value || 1 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Commitment period (yrs)">
              <Input type="number" value={state.commitmentPeriodYears ?? 3}
                onChange={(e) => setState({ ...state, commitmentPeriodYears: +e.target.value || 1 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="FoF mgmt fee" unit={`${((state.fofMgmtFeePct ?? 0.01) * 100).toFixed(2)}%`}>
              <input type="range" min={0} max={150} step={5}
                value={(state.fofMgmtFeePct ?? 0.01) * 10000}
                onChange={(e) => setState({ ...state, fofMgmtFeePct: +e.target.value / 10000 })}
                className="w-full" />
            </ToolField>
            <ToolField label="FoF carry" unit={`${((state.fofCarryPct ?? 0.05) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={15} step={1}
                value={(state.fofCarryPct ?? 0.05) * 100}
                onChange={(e) => setState({ ...state, fofCarryPct: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <h2 className="font-display text-xl pt-2">Average sub-fund</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Sub-fund carry" unit={`${((state.subFundCarryPct ?? 0.2) * 100).toFixed(0)}%`}>
              <input type="range" min={10} max={30} step={1}
                value={(state.subFundCarryPct ?? 0.2) * 100}
                onChange={(e) => setState({ ...state, subFundCarryPct: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="First distributions (yr)">
              <Input type="number" value={state.firstDistYear ?? 5}
                onChange={(e) => setState({ ...state, firstDistYear: +e.target.value || 5 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <h2 className="font-display text-xl pt-2">Exit mix (per sub-fund portfolio)</h2>

          <ToolField label="Write-offs (≈0.1×)" unit={`${((state.pctWriteoff ?? 0.6) * 100).toFixed(0)}%`}>
            <input type="range" min={0} max={90} step={5}
              value={(state.pctWriteoff ?? 0.6) * 100}
              onChange={(e) => setMix("pctWriteoff", +e.target.value)}
              className="w-full" />
          </ToolField>
          <ToolField label="Small exits (2×)" unit={`${((state.pctSmall ?? 0.2) * 100).toFixed(0)}%`}>
            <input type="range" min={0} max={60} step={5}
              value={(state.pctSmall ?? 0.2) * 100}
              onChange={(e) => setMix("pctSmall", +e.target.value)}
              className="w-full" />
          </ToolField>
          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Medium (5×)" unit={`${((state.pctMedium ?? 0.1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={40} step={5}
                value={(state.pctMedium ?? 0.1) * 100}
                onChange={(e) => setMix("pctMedium", +e.target.value)}
                className="w-full" />
            </ToolField>
            <ToolField label="Large (15×)" unit={`${((state.pctLarge ?? 0.1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={30} step={5}
                value={(state.pctLarge ?? 0.1) * 100}
                onChange={(e) => setMix("pctLarge", +e.target.value)}
                className="w-full" />
            </ToolField>
          </div>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label="Portfolio TVPI" value={`${r.finalTvpi.toFixed(2)}×`} sub="net to FoF LPs" tone={tvpiTone as any} />
            <ToolKpi label="Net IRR" value={`${(r.netIrr * 100).toFixed(1)}%`} sub="through both fee layers" tone={irrTone as any} />
            <ToolKpi label="Sub-fund gross" value={`${r.subFundGrossMultiple.toFixed(2)}×`} sub="implied by exit mix" />
            <ToolKpi label="Per sub-fund" value={`$${(r.effectiveSubFundCommitment / 1e6).toFixed(1)}M`} sub={`${state.numSubFunds ?? 20} commitments`} />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Annual cashflows</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Year</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Called</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Sub-fund calls</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">FoF fees</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Dist. to LPs</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">NAV</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">DPI</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">TVPI</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row) => (
                    <tr key={row.year} className="border-t border-foreground/5">
                      <td className="p-2 font-mono">Y{row.year}</td>
                      <td className="p-2 font-mono text-right">${(row.capitalCalled / 1e6).toFixed(1)}M</td>
                      <td className="p-2 font-mono text-right">${(row.subFundCalls / 1e6).toFixed(1)}M</td>
                      <td className="p-2 font-mono text-right">${(row.fofFees / 1e6).toFixed(2)}M</td>
                      <td className="p-2 font-mono text-right text-emerald-700">{row.distributionsToLps > 0 ? `$${(row.distributionsToLps / 1e6).toFixed(1)}M` : "—"}</td>
                      <td className="p-2 font-mono text-right">${(row.nav / 1e6).toFixed(1)}M</td>
                      <td className="p-2 font-mono text-right">{row.dpi.toFixed(2)}×</td>
                      <td className="p-2 font-mono text-right">{row.tvpi.toFixed(2)}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ToolKpi label="Total distributed" value={`$${(r.totalDistributed / 1e6).toFixed(1)}M`} sub={`on $${(r.totalCalled / 1e6).toFixed(1)}M called`} />
            <ToolKpi label="FoF fees + carry" value={`$${((r.totalFofFees + r.totalFofCarry) / 1e6).toFixed(1)}M`} sub={`${(r.totalFofFees / 1e6).toFixed(1)}M fees · ${(r.totalFofCarry / 1e6).toFixed(1)}M carry`} />
            <ToolKpi label="Sub-fund net" value={`${r.subFundNetMultiple.toFixed(2)}×`} sub="after sub-fund 2/20" />
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
