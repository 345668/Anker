"use client"

import { useEffect, useMemo, useState } from "react"
import { PageHeader } from "@/components/shell/page-header"

const VERMILION = "#e5380f"

export type RaiseEntry = {
  id: string
  name: string
  type: string | null
  tier: string | null
  stage: string
  checkSize: number | null
  lastContactedAt: string | null
}

const STAGES = ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"] as const
type Stage = (typeof STAGES)[number]
const STAGE_LABEL: Record<Stage, string> = {
  queued: "Queued", contacted: "Contacted", responded: "Responded", meeting: "Meeting",
  in_diligence: "Diligence", committed: "Committed", passed: "Passed",
}
// Stages that count as "in the round" (excludes passed).
const ACTIVE: Stage[] = ["queued", "contacted", "responded", "meeting", "in_diligence", "committed"]
const SOFT: Stage[] = ["responded", "meeting", "in_diligence"]
const STAGE_COLOR: Record<Stage, string> = {
  queued: "#94a3b8", contacted: "#0ea5e9", responded: "#8b5cf6", meeting: "#f59e0b",
  in_diligence: "#e5380f", committed: "#10b981", passed: "#64748b",
}

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)

export function RaisePipelineClient({ entries: initial }: { entries: RaiseEntry[] }) {
  const [entries, setEntries] = useState(initial)
  const [target, setTarget] = useState<number>(0)

  useEffect(() => {
    try { const t = localStorage.getItem("anker:raise-target"); if (t) setTarget(Number(t) || 0) } catch { /* ignore */ }
  }, [])
  function saveTarget(v: number) {
    setTarget(v)
    try { localStorage.setItem("anker:raise-target", String(v)) } catch { /* ignore */ }
  }

  const sumBy = (stages: Stage[]) => entries.filter((e) => stages.includes(e.stage as Stage)).reduce((s, e) => s + (e.checkSize ?? 0), 0)
  const committed = useMemo(() => sumBy(["committed"]), [entries])
  const softCircled = useMemo(() => sumBy(SOFT), [entries])
  const pipeline = useMemo(() => sumBy(ACTIVE), [entries])
  const pctClosed = target > 0 ? Math.min(100, (committed / target) * 100) : 0
  const pctSoft = target > 0 ? Math.min(100 - pctClosed, (softCircled / target) * 100) : 0

  const funnel = useMemo(() =>
    ACTIVE.map((st) => {
      const rows = entries.filter((e) => e.stage === st)
      return { stage: st, count: rows.length, amount: rows.reduce((s, e) => s + (e.checkSize ?? 0), 0) }
    }), [entries])
  const funnelMax = Math.max(1, ...funnel.map((f) => f.amount))

  async function patch(id: string, patch: { stage?: string; checkSize?: number | null }) {
    setEntries((rows) => rows.map((r) => (r.id === id ? { ...r, ...(patch.stage ? { stage: patch.stage } : {}), ...(patch.checkSize !== undefined ? { checkSize: patch.checkSize } : {}) } : r)))
    try {
      await fetch(`/api/crm/entries/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) })
    } catch { /* keep optimistic */ }
  }

  const grouped = ACTIVE.map((st) => ({ stage: st, rows: entries.filter((e) => e.stage === st) }))

  return (
    <div>
      <PageHeader
        accent={VERMILION}
        eyebrow="Fundraising"
        title="Raise pipeline"
        description="Your round, by stage — soft-circled and committed capital across every investor you're pitching."
      />

      {/* Progress */}
      <div className="border border-foreground/10 rounded-xl p-5 lg:p-6 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div>
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Target raise</div>
            <div className="flex items-center rounded-lg border border-foreground/15 overflow-hidden w-44">
              <span className="px-3 py-2 bg-foreground/[0.04] text-muted-foreground text-sm">$</span>
              <input value={target || ""} onChange={(e) => saveTarget(Number(e.target.value.replace(/[^0-9.]/g, "")) || 0)} inputMode="decimal" placeholder="Set target" className="flex-1 px-3 py-2 text-sm focus:outline-none bg-transparent tabular-nums" />
            </div>
          </div>
          <div className="flex gap-6">
            <Stat label="Committed" value={money(committed)} tone="emerald" />
            <Stat label="Soft-circled" value={money(softCircled)} />
            <Stat label="Total pipeline" value={money(pipeline)} />
            <Stat label="% of target" value={target > 0 ? `${pctClosed.toFixed(0)}%` : "—"} />
          </div>
        </div>
        <div className="h-3 rounded-full bg-foreground/10 overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctClosed}%` }} title={`Committed ${money(committed)}`} />
          <div className="h-full bg-emerald-500/30 transition-all" style={{ width: `${pctSoft}%` }} title={`Soft-circled ${money(softCircled)}`} />
        </div>
        {target > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {money(Math.max(0, target - committed))} remaining to close · {money(Math.max(0, target - committed - softCircled))} still to source
          </p>
        )}
      </div>

      {/* Stage funnel */}
      <div className="border border-foreground/10 rounded-xl p-5 lg:p-6 mb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4">Stage funnel</div>
        <div className="space-y-2.5">
          {funnel.map((f) => (
            <div key={f.stage} className="flex items-center gap-3">
              <span className="w-24 text-sm shrink-0">{STAGE_LABEL[f.stage]}</span>
              <div className="flex-1 h-6 rounded bg-foreground/[0.04] overflow-hidden">
                <div className="h-full rounded transition-all" style={{ width: `${(f.amount / funnelMax) * 100}%`, backgroundColor: STAGE_COLOR[f.stage], minWidth: f.amount > 0 ? 4 : 0 }} />
              </div>
              <span className="w-16 text-right text-xs tabular-nums text-muted-foreground shrink-0">{f.count} · </span>
              <span className="w-20 text-right text-sm tabular-nums font-medium shrink-0">{money(f.amount)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Investors by stage */}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground border border-foreground/10 rounded-lg p-6">
          No investors in your pipeline yet. Add matches from Discover or Find Investors, then set a check size here.
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.filter((g) => g.rows.length > 0).map((g) => (
            <div key={g.stage}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: STAGE_COLOR[g.stage as Stage] }} />
                <h3 className="text-sm font-semibold">{STAGE_LABEL[g.stage as Stage]}</h3>
                <span className="text-xs text-muted-foreground">{g.rows.length}</span>
              </div>
              <div className="overflow-x-auto border border-foreground/10 rounded-lg">
                <table className="w-full text-sm">
                  <tbody>
                    {g.rows.map((e) => (
                      <tr key={e.id} className="border-b border-foreground/[0.06] last:border-0">
                        <td className="px-4 py-2.5 font-medium">{e.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{e.type ?? "—"}{e.tier ? ` · ${e.tier}` : ""}</td>
                        <td className="px-4 py-2.5">
                          <select value={e.stage} onChange={(ev) => patch(e.id, { stage: ev.target.value })}
                            className="rounded-md border border-foreground/12 bg-background px-2 py-1 text-xs focus:outline-none focus:border-foreground/40">
                            {ACTIVE.concat("passed").map((s) => <option key={s} value={s}>{STAGE_LABEL[s as Stage]}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center rounded-md border border-foreground/12 overflow-hidden w-32">
                            <span className="px-2 py-1 bg-foreground/[0.04] text-muted-foreground text-xs">$</span>
                            <input defaultValue={e.checkSize ?? ""} placeholder="Check"
                              onBlur={(ev) => { const v = Number(ev.target.value.replace(/[^0-9.]/g, "")); patch(e.id, { checkSize: Number.isFinite(v) && v > 0 ? v : null }) }}
                              inputMode="decimal" className="flex-1 px-2 py-1 text-xs text-right focus:outline-none bg-transparent tabular-nums w-full" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "emerald" }) {
  return (
    <div>
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-xl font-semibold tabular-nums ${tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{value}</div>
    </div>
  )
}
