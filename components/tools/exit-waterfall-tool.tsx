"use client"

import { useMemo, useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ToolField, ToolKpi, ToolNote, ToolShell } from "./tool-shell"
import {
  compute,
  type ExitWaterfallInputs,
  type ParticipationKind,
  type ShareClass,
} from "@/lib/tools/exit-waterfall"

const DEFAULT_CLASSES: ShareClass[] = [
  { name: "Series B",  invested: 12_000_000, shares: 4_000_000, seniority: 2, prefMultiple: 1, participation: "non-participating" },
  { name: "Series A",  invested:  4_000_000, shares: 2_500_000, seniority: 1, prefMultiple: 1, participation: "non-participating" },
  { name: "Common",    invested: 0,           shares: 6_500_000, seniority: 0 },
  { name: "ESOP",      invested: 0,           shares: 1_500_000, seniority: 0 },
]

const DEFAULT_STATE: ExitWaterfallInputs = {
  exitValue: 80_000_000,
  transactionCostsPct: 0.02,
  shareClasses: DEFAULT_CLASSES,
}

export function ExitWaterfallTool() {
  const [exporting, setExporting] = useState(false)
  const [state, setState] = useState<ExitWaterfallInputs>(DEFAULT_STATE)
  const result = useMemo(() => compute(state), [state])

  function setClasses(next: ShareClass[]) { setState({ ...state, shareClasses: next }) }

  return (
    <ToolShell
      slug="exit-waterfall"
      eyebrow="Exit Waterfall"
      title="Who gets what at exit."
      description="Cap-table-aware exit math — liquidation preferences, participation, caps, conversion. Sensitivity grid across exit values + common-breakeven detection."
      state={state}
      exporting={exporting}
      setExporting={setExporting}
      inputs={
        <>
          <h2 className="font-display text-xl">Inputs</h2>

          <ToolField label="Exit value (EV)" unit="USD">
            <Input
              type="number"
              value={state.exitValue}
              onChange={(e) => setState({ ...state, exitValue: +e.target.value || 0 })}
              className="h-10 font-mono"
            />
          </ToolField>

          <ToolField label="Transaction costs (bankers + legal)" unit={`${((state.transactionCostsPct ?? 0) * 100).toFixed(1)}%`}>
            <input
              type="range" min={0} max={5} step={0.1}
              value={(state.transactionCostsPct ?? 0) * 100}
              onChange={(e) => setState({ ...state, transactionCostsPct: +e.target.value / 100 })}
              className="w-full"
            />
          </ToolField>

          <div className="pt-2">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-display text-sm">Share classes</h3>
              <button
                type="button"
                onClick={() => setClasses([
                  ...state.shareClasses,
                  { name: `Class ${state.shareClasses.length + 1}`, invested: 0, shares: 0, seniority: 0 },
                ])}
                className="inline-flex items-center gap-1 text-[11px] font-mono px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5"
              >
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            <div className="space-y-2">
              {state.shareClasses.map((c, i) => (
                <ClassRow
                  key={i}
                  cls={c}
                  onChange={(next) => setClasses(state.shareClasses.map((x, j) => j === i ? next : x))}
                  onDelete={() => setClasses(state.shareClasses.filter((_, j) => j !== i))}
                />
              ))}
            </div>
            <p className="text-[10px] font-mono text-muted-foreground mt-2">
              Seniority: 0 = common/ESOP, 1 = oldest preferred, 2+ = newer rounds (paid first).
            </p>
          </div>
        </>
      }
      outputs={
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <ToolKpi
              label="Net to distribute"
              value={`$${(result.netExitValue / 1e6).toFixed(1)}M`}
              sub={`${((state.transactionCostsPct ?? 0) * 100).toFixed(1)}% tx costs`}
            />
            <ToolKpi
              label="Best multiple"
              value={`${result.payouts.reduce((m, p) => Math.max(m, p.multiple), 0).toFixed(2)}×`}
              sub={result.payouts.reduce((max, p) => p.multiple > max.multiple ? p : max, result.payouts[0]).name}
            />
            <ToolKpi
              label="Common breakeven"
              value={result.commonBreakevenExit != null ? `$${(result.commonBreakevenExit / 1e6).toFixed(0)}M` : "—"}
              sub={result.commonBreakevenExit != null && result.commonBreakevenExit > state.exitValue ? "above current EV" : "common already paid"}
              tone={result.commonBreakevenExit != null && result.commonBreakevenExit > state.exitValue ? "warn" : "good"}
            />
            <ToolKpi
              label="Conversions"
              value={String(result.payouts.filter((p) => p.strategy === "convert").length)}
              sub="preferred classes that convert at this EV"
            />
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Payout by class</h3>
            <div className="space-y-2">
              {result.payouts.map((p, i) => {
                const wide = Math.max(2, p.pctOfExit * 100)
                return (
                  <div key={i}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-foreground/5 text-muted-foreground">
                          {p.strategy}
                        </span>
                      </div>
                      <span className="font-mono text-muted-foreground">
                        ${Math.round(p.payout).toLocaleString()}
                        {p.multiple > 0 && ` · ${p.multiple.toFixed(2)}×`}
                        {" · "}{(p.pctOfExit * 100).toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-foreground/5 rounded overflow-hidden">
                      <div className="h-full bg-foreground transition-all" style={{ width: `${wide}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="border border-foreground/10 rounded-lg p-6">
            <h3 className="font-display text-lg mb-4">Sensitivity by exit value</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-foreground/5">
                  <tr>
                    <th className="p-2 text-left font-mono uppercase tracking-wider text-muted-foreground">Exit</th>
                    {result.sensitivity[0]?.payouts.map((p, i) => (
                      <th key={i} className="p-2 text-right font-mono uppercase tracking-wider text-muted-foreground">{p.name}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.sensitivity.map((s, i) => (
                    <tr key={i} className="border-t border-foreground/5">
                      <td className="p-2 font-mono">${(s.exitValue / 1e6).toFixed(0)}M</td>
                      {s.payouts.map((p, j) => (
                        <td key={j} className="p-2 font-mono text-right">
                          {p.payout > 0 ? `$${(p.payout / 1e6).toFixed(2)}M` : "—"}
                          {p.multiple > 0 && (
                            <span className="text-muted-foreground"> ({p.multiple.toFixed(1)}×)</span>
                          )}
                        </td>
                      ))}
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

function ClassRow({ cls, onChange, onDelete }: { cls: ShareClass; onChange: (c: ShareClass) => void; onDelete: () => void }) {
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-12 gap-2 items-center">
        <input
          className="col-span-3 h-8 px-2 text-xs border border-foreground/10 rounded bg-background"
          value={cls.name}
          onChange={(e) => onChange({ ...cls, name: e.target.value })}
          placeholder="Class"
        />
        <input
          type="number"
          className="col-span-3 h-8 px-2 text-xs font-mono text-right border border-foreground/10 rounded bg-background"
          value={cls.invested}
          onChange={(e) => onChange({ ...cls, invested: +e.target.value || 0 })}
          placeholder="Invested ($)"
        />
        <input
          type="number"
          className="col-span-3 h-8 px-2 text-xs font-mono text-right border border-foreground/10 rounded bg-background"
          value={cls.shares}
          onChange={(e) => onChange({ ...cls, shares: +e.target.value || 0 })}
          placeholder="Shares"
        />
        <input
          type="number"
          className="col-span-2 h-8 px-2 text-xs font-mono text-right border border-foreground/10 rounded bg-background"
          value={cls.seniority}
          onChange={(e) => onChange({ ...cls, seniority: +e.target.value || 0 })}
          placeholder="Sen."
          title="Seniority (0 = common, higher = paid first)"
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
      {cls.seniority > 0 && (
        <div className="grid grid-cols-12 gap-2 items-center pl-2">
          <input
            type="number"
            step="0.1"
            className="col-span-3 h-8 px-2 text-xs font-mono text-right border border-foreground/10 rounded bg-background"
            value={cls.prefMultiple ?? 1}
            onChange={(e) => onChange({ ...cls, prefMultiple: +e.target.value || 1 })}
            placeholder="Pref ×"
            title="Liquidation preference multiple (1× standard)"
          />
          <select
            className="col-span-5 h-8 px-2 text-xs border border-foreground/10 rounded bg-background"
            value={cls.participation ?? "non-participating"}
            onChange={(e) => onChange({ ...cls, participation: e.target.value as ParticipationKind })}
          >
            <option value="non-participating">Non-participating</option>
            <option value="participating">Participating (uncapped)</option>
            <option value="capped-participating">Capped participating</option>
          </select>
          {cls.participation === "capped-participating" && (
            <input
              type="number"
              step="0.5"
              className="col-span-3 h-8 px-2 text-xs font-mono text-right border border-foreground/10 rounded bg-background"
              value={cls.participationCap ?? 2}
              onChange={(e) => onChange({ ...cls, participationCap: +e.target.value || 2 })}
              placeholder="Cap ×"
              title="Participation cap as multiple of invested"
            />
          )}
        </div>
      )}
    </div>
  )
}
