"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { PageHeader } from "@/components/shell/page-header"

import { formatMoney } from "@/lib/platform/money"
import type { RaiseRound } from "@/lib/fundraising/rounds"

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
const ENGAGED: Stage[] = ["responded", "meeting", "in_diligence"]
const STAGE_COLOR: Record<Stage, string> = {
  queued: "#94a3b8", contacted: "#0ea5e9", responded: "#8b5cf6", meeting: "#f59e0b",
  in_diligence: "var(--platform-link)", committed: "var(--platform-success)", passed: "var(--muted-foreground)",
}

export function RaisePipelineClient({ entries: initial, round, canEdit = true }: { entries: RaiseEntry[]; round: RaiseRound; canEdit?: boolean }) {
  const [entries, setEntries] = useState(initial)
  const [savedRound, setSavedRound] = useState(round)
  const [targetInput, setTargetInput] = useState(String(round.target))
  const [pending, setPending] = useState<string | null>(null)
  const inFlight = useRef(false)
  const focusAfterSave = useRef<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const target = savedRound.target
  const money = (value: number) => formatMoney(value, round.currency)
  useEffect(() => {
    if (!pending && focusAfterSave.current) {
      document.getElementById(`stage-${focusAfterSave.current}`)?.focus()
      focusAfterSave.current = null
    }
  }, [entries, pending])
  async function saveTarget(event: React.FormEvent) {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setPending("target"); setError(null); setNotice(null)
    try {
      const response = await fetch("/api/fundraising/rounds", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: round.id, target: Number(targetInput), revision: savedRound.revision }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Your target was not saved.")
      setSavedRound(data.round); setNotice("Round target saved.")
    } catch (e) { setError(e instanceof Error ? e.message : "Your target was not saved. Try again.") }
    finally { setPending(null); inFlight.current = false }
  }

  const sumBy = (stages: Stage[]) => entries.filter((e) => stages.includes(e.stage as Stage)).reduce((s, e) => s + (e.checkSize ?? 0), 0)
  const committed = useMemo(() => sumBy(["committed"]), [entries])
  const engaged = useMemo(() => sumBy(ENGAGED), [entries])
  const pipeline = useMemo(() => sumBy(ACTIVE), [entries])
  const pctClosed = target > 0 ? Math.min(100, (committed / target) * 100) : 0
  const pctEngaged = target > 0 ? Math.min(100 - pctClosed, (engaged / target) * 100) : 0

  const funnel = useMemo(() =>
    ACTIVE.map((st) => {
      const rows = entries.filter((e) => e.stage === st)
      return { stage: st, count: rows.length, amount: rows.reduce((s, e) => s + (e.checkSize ?? 0), 0) }
    }), [entries])
  const funnelMax = Math.max(1, ...funnel.map((f) => f.amount))

  async function patch(id: string, change: { stage?: string; checkSize?: number | null }) {
    if (inFlight.current || !canEdit) return
    inFlight.current = true
    setPending(id); setError(null); setNotice(null)
    try {
      const response = await fetch(`/api/crm/entries/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...change, roundId: round.id }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Your change was not saved.")
      if (change.stage) focusAfterSave.current = id
      setEntries(rows => rows.map(r => r.id === id ? { ...r, stage: data.entry.stage, checkSize: data.entry.check_size == null ? null : Number(data.entry.check_size) } : r))
      setNotice("Investor updated.")
    } catch (e) { setError(e instanceof Error ? e.message : "Your change was not saved. Try again.") }
    finally { setPending(null); inFlight.current = false }
  }

  const grouped = ACTIVE.map((st) => ({ stage: st, rows: entries.filter((e) => e.stage === st) }))

  return (
    <div>
      <PageHeader
        eyebrow="Fundraising"
        title={round.name}
        description={`Your selected board · ${round.currency}. Estimated checks reflect your entries; only the Committed stage counts as committed capital.`}
      />

      {error && <p role="alert" className="platform-panel p-4 mb-4 text-[var(--platform-danger)]">{error} Your previously saved values remain in effect.</p>}
      <p role="status" className="text-sm text-muted-foreground mb-4">{pending ? "Saving…" : notice}</p>
      {/* Progress */}
      <div className="platform-panel p-5 lg:p-6 mb-6">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
          <div>
            <form onSubmit={saveTarget}>
              <label htmlFor="round-target" className="block text-xs text-muted-foreground mb-2">Target raise · {round.currency}</label>
              <div className="flex flex-wrap gap-2">
                <input id="round-target" type="number" min="0" max="1000000000000" step="0.01" required value={targetInput} onChange={e => setTargetInput(e.target.value)} disabled={!canEdit || !!pending} className="min-h-11 w-44 px-3 border border-input rounded bg-background tabular-nums" />
                <button disabled={!canEdit || !!pending || targetInput === String(target)} className="min-h-11 px-3 rounded border border-input disabled:opacity-50">Save target</button>
              </div>
            </form>
          </div>
          <div className="flex flex-wrap gap-4 sm:gap-6">
            <Stat label="Committed" value={money(committed)} tone="emerald" />
            <Stat label="Engaged estimates" value={money(engaged)} />
            <Stat label="Total pipeline" value={money(pipeline)} />
            <Stat label="% of target" value={target > 0 ? `${pctClosed.toFixed(0)}%` : "—"} />
          </div>
        </div>
        <div className="h-3 rounded-full bg-foreground/10 overflow-hidden flex">
          <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pctClosed}%` }} title={`Committed ${money(committed)}`} />
          <div className="h-full bg-primary/30 transition-all" style={{ width: `${pctEngaged}%` }} title={`Engaged estimates ${money(engaged)}`} />
        </div>
        {target > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {money(Math.max(0, target - committed))} remaining to close · {money(Math.max(0, target - committed - engaged))} not covered by committed or engaged estimates
          </p>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-6">Engaged estimates include Responded, Meeting and Diligence. They indicate potential check sizes, not investor pledges.</p>
      {/* Stage funnel */}
      <div className="platform-panel p-5 lg:p-6 mb-6">
        <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground mb-4">Stage funnel</div>
        <div className="space-y-2.5">
          {funnel.map((f) => (
            <div key={f.stage} className="grid grid-cols-[6rem_1fr] sm:grid-cols-[6rem_1fr_4rem_5rem] items-center gap-2">
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
          No investors in your pipeline yet. Add investors to this round’s board in Relationships, then set a check size here.
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
                  <caption className="sr-only">{STAGE_LABEL[g.stage as Stage]} investors in {round.name}</caption>
                  <thead className="sr-only"><tr><th>Investor</th><th className="hidden sm:table-cell">Type</th><th>Stage</th><th>Check size</th></tr></thead>
                  <tbody>
                    {g.rows.map((e) => (
                      <tr key={e.id} className="border-b border-foreground/[0.06] last:border-0">
                        <td className="px-4 py-2.5 font-medium">{e.name}</td>
                        <td className="px-4 py-2.5 text-muted-foreground hidden sm:table-cell">{e.type ?? "—"}{e.tier ? ` · ${e.tier}` : ""}</td>
                        <td className="px-4 py-2.5">
                          <select id={`stage-${e.id}`} aria-label={`Stage for ${e.name}`} disabled={!canEdit || !!pending} value={e.stage} onChange={(ev) => patch(e.id, { stage: ev.target.value })}
                            className="rounded-md border border-foreground/12 bg-background px-2 py-1 text-xs focus:outline-none focus:border-foreground/40">
                            {ACTIVE.concat("passed").map((s) => <option key={s} value={s}>{STAGE_LABEL[s as Stage]}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="inline-flex items-center rounded-md border border-foreground/12 overflow-hidden w-32">
                            <span className="px-2 py-1 bg-foreground/[0.04] text-muted-foreground text-xs">{round.currency}</span>
                            <input key={`${e.id}:${e.checkSize}:${pending ?? "idle"}`} aria-label={`Check size for ${e.name} in ${round.currency}`} disabled={!canEdit || !!pending} defaultValue={e.checkSize ?? ""} placeholder="Check"
                              onBlur={(ev) => { const raw = ev.target.value.trim(); const value = raw === "" ? null : Number(raw); if (value !== null && (!Number.isFinite(value) || value < 0 || value > 1e12)) { setError("Enter a valid non-negative check size."); ev.target.value = String(e.checkSize ?? ""); return } if (value !== e.checkSize) patch(e.id, { checkSize: value }) }}
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
