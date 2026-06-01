"use client"

import { useMemo, useState } from "react"
import { CheckCircle2, XCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ToolField, ToolKpi, ToolNote, ToolShell } from "./tool-shell"
import { compute, type QsbsInputs } from "@/lib/tools/qsbs"
import { cn } from "@/lib/utils"

export function QsbsTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<QsbsInputs>({
    isCCorp: true,
    acquiredAt: "2020-01-15",
    exitAt: "2026-04-28",
    grossAssetsAtIssuance: 8_000_000,
    inActiveBusiness: true,
    excludedTrade: false,
    costBasis: 50_000,
    saleProceeds: 5_000_000,
    taxRateLtcg: 0.238,
    acquisitionEra: "post_sept_2010",
  })

  const r = useMemo(() => compute(state), [state])

  const tone = r.qualifies ? "good" : "bad"

  return (
    <ToolShell
      slug="qsbs-eligibility"
      eyebrow="QSBS · Section 1202"
      title="Tax-free exit?"
      description="5-year hold, $50M assets test, active-business test, eligible-trade test. Computes the per-issuer cap and your estimated federal tax savings. NOT TAX ADVICE."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Inputs</h2>

          <Toggle label="Issuer is a C-corp" value={state.isCCorp} onChange={(v) => setState({ ...state, isCCorp: v })} />

          <ToolField label="Stock acquired on">
            <Input type="date" value={state.acquiredAt} onChange={(e) => setState({ ...state, acquiredAt: e.target.value })} className="h-10" />
          </ToolField>
          <ToolField label="Sold / sale date">
            <Input type="date" value={state.exitAt} onChange={(e) => setState({ ...state, exitAt: e.target.value })} className="h-10" />
          </ToolField>
          <ToolField label="Gross assets at issuance" unit="USD">
            <Input type="number" value={state.grossAssetsAtIssuance} onChange={(e) => setState({ ...state, grossAssetsAtIssuance: +e.target.value })} className="h-10 font-mono" />
          </ToolField>

          <Toggle label="80%+ assets in qualified active trade" value={state.inActiveBusiness} onChange={(v) => setState({ ...state, inActiveBusiness: v })} />
          <Toggle label="Excluded trade (health/law/etc.)" value={state.excludedTrade} onChange={(v) => setState({ ...state, excludedTrade: v })} />

          <ToolField label="Cost basis" unit="USD">
            <Input type="number" value={state.costBasis} onChange={(e) => setState({ ...state, costBasis: +e.target.value })} className="h-10 font-mono" />
          </ToolField>
          <ToolField label="Sale proceeds" unit="USD">
            <Input type="number" value={state.saleProceeds} onChange={(e) => setState({ ...state, saleProceeds: +e.target.value })} className="h-10 font-mono" />
          </ToolField>
          <ToolField label="Marginal LTCG rate" unit={`${((state.taxRateLtcg ?? 0.238) * 100).toFixed(1)}%`}>
            <Input type="number" step="0.001" value={state.taxRateLtcg} onChange={(e) => setState({ ...state, taxRateLtcg: +e.target.value })} className="h-10 font-mono" />
          </ToolField>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi label="Qualifies?" value={r.qualifies ? "YES" : "NO"} sub={`${r.yearsHeld.toFixed(2)} yrs held`} tone={tone} />
            <ToolKpi label="Excluded gain" value={`$${Math.round(r.excludedGain).toLocaleString()}`} sub={`${(r.exclusionPct * 100).toFixed(0)}% exclusion`} />
            <ToolKpi label="Tax savings" value={`$${Math.round(r.estimatedSavings).toLocaleString()}`} sub="vs. no QSBS" tone="good" />
            <ToolKpi label="Per-issuer cap" value={`$${(r.perIssuerCap / 1e6).toFixed(1)}M`} sub="max($10M, 10× basis)" />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Eligibility tests</h3>
            <div className="space-y-2">
              {[
                ["C-corp at original issuance", r.passes.cCorp],
                ["≥ 5-year holding period", r.passes.holding],
                ["Gross assets ≤ $50M at issuance", r.passes.grossAssets],
                ["Active-business (80% rule)", r.passes.activeBusiness],
                ["Not in an excluded trade", r.passes.eligibleTrade],
              ].map(([label, ok]) => (
                <div key={String(label)} className={cn("flex items-center gap-3 p-3 rounded-md", ok ? "bg-emerald-500/5" : "bg-destructive/5")}>
                  {ok ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <XCircle className="w-5 h-5 text-destructive" />}
                  <span className="text-sm">{String(label)}</span>
                </div>
              ))}
            </div>
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

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!value)} className="w-full flex items-center justify-between p-3 rounded-md hover:bg-foreground/5 border border-foreground/10">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className={cn("relative w-9 h-5 rounded-full transition-colors", value ? "bg-foreground" : "bg-foreground/20")}>
        <span className="absolute top-0.5 w-4 h-4 rounded-full bg-background transition-transform" style={{ transform: value ? "translateX(18px)" : "translateX(2px)" }} />
      </span>
    </button>
  )
}
