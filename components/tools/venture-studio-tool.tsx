"use client"

import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { ToolField, ToolKpi, ToolNote, ToolShell } from "./tool-shell"
import { compute, type VentureStudioInputs } from "@/lib/tools/venture-studio-model"

const DEFAULT_STATE: VentureStudioInputs = {
  fundSizeUsd: 50_000_000,
  fundLifeYears: 10,
  newInvestmentYears: 4,
  mgmtFeePct: 0.02,
  carryPct: 0.20,
  studioAllocationPct: 0.20,
  companiesPerYear: 4,
  studioCommonPct: 0.30,
  checkPerNewCoUsd: 1_500_000,
  pctWriteoff: 0.50,
  pctSmall: 0.25,
  pctMedium: 0.15,
  pctLarge: 0.10,
  exitYearFromLaunch: 6,
  studioAnnualOpexUsd: 2_000_000,
  studioProceedsToFundPct: 0.80,
}

export function VentureStudioTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<VentureStudioInputs>(DEFAULT_STATE)
  const r = useMemo(() => compute(state), [state])

  const tvpiTone = r.finalTvpi >= 2.5 ? "good" : r.finalTvpi >= 2 ? "warn" : "bad"
  const irrTone = r.netIrr >= 0.20 ? "good" : r.netIrr >= 0.12 ? "warn" : "bad"

  return (
    <ToolShell
      slug="venture-studio-model"
      eyebrow="Venture Studio Model"
      title="Build, own, distribute."
      description="0/20/20 studio fund — NewCo launches, studio common ownership, fund + studio twin entities, exit mix, LP waterfall. xlsx export."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Fund</h2>

          <ToolField label="Fund size" unit="USD">
            <Input type="number" value={state.fundSizeUsd}
              onChange={(e) => setState({ ...state, fundSizeUsd: +e.target.value || 0 })}
              className="h-10 font-mono" />
          </ToolField>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Mgmt fee" unit={`${((state.mgmtFeePct ?? 0.02) * 100).toFixed(2)}%`}>
              <input type="range" min={0} max={300} step={5}
                value={(state.mgmtFeePct ?? 0.02) * 10000}
                onChange={(e) => setState({ ...state, mgmtFeePct: +e.target.value / 10000 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Carry" unit={`${((state.carryPct ?? 0.2) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={30} step={1}
                value={(state.carryPct ?? 0.2) * 100}
                onChange={(e) => setState({ ...state, carryPct: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <h2 className="font-display text-xl pt-2">Studio</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="NewCos / year">
              <Input type="number" value={state.companiesPerYear ?? 4}
                onChange={(e) => setState({ ...state, companiesPerYear: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Check per NewCo" unit="USD">
              <Input type="number" value={state.checkPerNewCoUsd}
                onChange={(e) => setState({ ...state, checkPerNewCoUsd: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Studio common" unit={`${((state.studioCommonPct ?? 0.3) * 100).toFixed(0)}%`}>
              <input type="range" min={5} max={60} step={5}
                value={(state.studioCommonPct ?? 0.3) * 100}
                onChange={(e) => setState({ ...state, studioCommonPct: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Studio allocation" unit={`${((state.studioAllocationPct ?? 0.2) * 100).toFixed(0)}% of fund`}>
              <input type="range" min={0} max={40} step={5}
                value={(state.studioAllocationPct ?? 0.2) * 100}
                onChange={(e) => setState({ ...state, studioAllocationPct: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Studio opex / yr" unit="USD">
              <Input type="number" value={state.studioAnnualOpexUsd ?? 2_000_000}
                onChange={(e) => setState({ ...state, studioAnnualOpexUsd: +e.target.value || 0 })}
                className="h-10 font-mono" />
            </ToolField>
            <ToolField label="Common proceeds → LPs" unit={`${((state.studioProceedsToFundPct ?? 0.8) * 100).toFixed(0)}%`}>
              <input type="range" min={50} max={100} step={5}
                value={(state.studioProceedsToFundPct ?? 0.8) * 100}
                onChange={(e) => setState({ ...state, studioProceedsToFundPct: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <h2 className="font-display text-xl pt-2">Outcomes</h2>

          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Write-offs (0×)" unit={`${((state.pctWriteoff ?? 0.5) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={90} step={5}
                value={(state.pctWriteoff ?? 0.5) * 100}
                onChange={(e) => setState({ ...state, pctWriteoff: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Small (2×)" unit={`${((state.pctSmall ?? 0.25) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={60} step={5}
                value={(state.pctSmall ?? 0.25) * 100}
                onChange={(e) => setState({ ...state, pctSmall: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <ToolField label="Medium (6×)" unit={`${((state.pctMedium ?? 0.15) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={40} step={5}
                value={(state.pctMedium ?? 0.15) * 100}
                onChange={(e) => setState({ ...state, pctMedium: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
            <ToolField label="Large (20×)" unit={`${((state.pctLarge ?? 0.1) * 100).toFixed(0)}%`}>
              <input type="range" min={0} max={30} step={5}
                value={(state.pctLarge ?? 0.1) * 100}
                onChange={(e) => setState({ ...state, pctLarge: +e.target.value / 100 })}
                className="w-full" />
            </ToolField>
          </div>

          <ToolField label="Exit year from launch">
            <Input type="number" value={state.exitYearFromLaunch ?? 6}
              onChange={(e) => setState({ ...state, exitYearFromLaunch: +e.target.value || 6 })}
              className="h-10 font-mono" />
          </ToolField>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label="Net TVPI" value={`${r.finalTvpi.toFixed(2)}×`} sub="to fund LPs" tone={tvpiTone as any} />
            <ToolKpi label="Net IRR" value={`${(r.netIrr * 100).toFixed(1)}%`} sub="LP cashflow IRR" tone={irrTone as any} />
            <ToolKpi label="NewCos" value={`${Math.round(r.totalCompanies)}`} sub={`${((state.studioCommonPct ?? 0.3) * 100).toFixed(0)}% common each`} />
            <ToolKpi label="Implied multiple" value={`${r.impliedNewCoMultiple.toFixed(2)}×`} sub="per NewCo, from exit mix" />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Fund + studio, by year</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Year</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Launched</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">→ NewCos</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">→ Studio</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Equity exits</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Common exits</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">Dist. to LPs</th>
                    <th className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">TVPI</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rows.map((row) => (
                    <tr key={row.year} className="border-t border-foreground/5">
                      <td className="p-2 font-mono">Y{row.year}</td>
                      <td className="p-2 font-mono text-right">{Math.round(row.companiesLaunched)}</td>
                      <td className="p-2 font-mono text-right">${(row.fundInvested / 1e6).toFixed(1)}M</td>
                      <td className="p-2 font-mono text-right">${(row.studioFunding / 1e6).toFixed(1)}M</td>
                      <td className="p-2 font-mono text-right">{row.exitProceedsEquity > 0 ? `$${(row.exitProceedsEquity / 1e6).toFixed(1)}M` : "—"}</td>
                      <td className="p-2 font-mono text-right">{row.exitProceedsCommon > 0 ? `$${(row.exitProceedsCommon / 1e6).toFixed(1)}M` : "—"}</td>
                      <td className="p-2 font-mono text-right text-emerald-700">{row.distributionsToLps > 0 ? `$${(row.distributionsToLps / 1e6).toFixed(1)}M` : "—"}</td>
                      <td className="p-2 font-mono text-right">{row.tvpi.toFixed(2)}×</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <ToolKpi label="Distributions to LPs" value={`$${(r.totalDistributions / 1e6).toFixed(1)}M`} sub={`on $${(r.totalCalled / 1e6).toFixed(1)}M called`} />
            <ToolKpi label="Capital split" value={`$${(r.totalInvestedNewCos / 1e6).toFixed(1)}M / $${(r.totalStudioFunding / 1e6).toFixed(1)}M`} sub="NewCos / studio opco" />
            <ToolKpi label="GP income" value={`$${(r.studioGpIncome / 1e6).toFixed(1)}M`} sub="carry + studio common share" />
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
