"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import type { LpDistributionRow, LpCallRow } from "@/lib/portfolio/data-room"

const money = (v: number) => `$${Math.round(v).toLocaleString()}`
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

const STATUS_CLS: Record<string, string> = {
  paid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  notified: "bg-[#127c78]/10 text-[#127c78]",
  sent: "bg-[#127c78]/10 text-[#127c78]",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  settled: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  waived: "bg-foreground/[0.06] text-muted-foreground",
}
const badge = (s: string) => STATUS_CLS[s] ?? "bg-foreground/[0.06] text-muted-foreground"

export function LpActivityClient({ distributions, calls }: { distributions: LpDistributionRow[]; calls: LpCallRow[] }) {
  const [dist, setDist] = useState(distributions)
  const [cl, setCl] = useState(calls)
  const [busy, setBusy] = useState<string | null>(null)

  async function act(kind: "call" | "distribution", lineId: string, current: string | null) {
    setBusy(lineId)
    const undo = !!current
    // optimistic
    const at = undo ? null : new Date().toISOString()
    if (kind === "call") setCl((rows) => rows.map((r) => (r.line_id === lineId ? { ...r, acknowledged_at: at } : r)))
    else setDist((rows) => rows.map((r) => (r.line_id === lineId ? { ...r, confirmed_at: at } : r)))
    try {
      await fetch("/api/lp/acknowledge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind, lineId, undo }) })
    } catch { /* keep optimistic */ } finally { setBusy(null) }
  }

  const totalDistributed = dist.filter((d) => d.status === "paid").reduce((s, d) => s + d.amount, 0)
  const totalCalled = cl.filter((c) => c.status === "paid" || c.status === "settled").reduce((s, c) => s + c.amount, 0)

  return (
    <div className="space-y-10">
      {/* Capital calls */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-xl tracking-tight">Capital calls</h2>
          <span className="text-xs text-muted-foreground tabular-nums">Paid to date {money(totalCalled)}</span>
        </div>
        {cl.length ? (
          <div className="overflow-x-auto border border-foreground/10 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2.5">Fund</th>
                  <th className="text-left px-4 py-2.5">Call</th>
                  <th className="text-left px-4 py-2.5">Due</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">Acknowledge</th>
                </tr>
              </thead>
              <tbody>
                {cl.map((c) => (
                  <tr key={c.line_id} className="border-b border-foreground/[0.06] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{c.fund_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{c.title ?? `Capital call #${c.call_number}`}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(c.due_date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(c.amount)}</td>
                    <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-1.5 py-0.5 rounded capitalize ${badge(c.status)}`}>{c.status}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      {c.acknowledged_at ? (
                        <button onClick={() => act("call", c.line_id, c.acknowledged_at)} disabled={busy === c.line_id}
                          className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50">
                          <Check className="w-3.5 h-3.5" /> Acknowledged
                        </button>
                      ) : (
                        <button onClick={() => act("call", c.line_id, null)} disabled={busy === c.line_id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/[0.04] disabled:opacity-50">
                          {busy === c.line_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Acknowledge
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground border border-foreground/10 rounded-lg p-6">No capital calls addressed to you yet.</p>
        )}
      </section>

      {/* Distributions */}
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-display text-xl tracking-tight">Distributions received</h2>
          <span className="text-xs text-muted-foreground tabular-nums">Paid to date {money(totalDistributed)}</span>
        </div>
        {dist.length ? (
          <div className="overflow-x-auto border border-foreground/10 rounded-lg">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2.5">Fund</th>
                  <th className="text-left px-4 py-2.5">Distribution</th>
                  <th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-right px-4 py-2.5">Amount</th>
                  <th className="text-left px-4 py-2.5">Status</th>
                  <th className="text-right px-4 py-2.5">Confirm receipt</th>
                </tr>
              </thead>
              <tbody>
                {dist.map((d) => (
                  <tr key={d.line_id} className="border-b border-foreground/[0.06] last:border-0">
                    <td className="px-4 py-2.5 font-medium">{d.fund_name}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{d.title ?? `Distribution #${d.distribution_number}`}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{fmtDate(d.paid_at ?? d.date)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium">{money(d.amount)}</td>
                    <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-1.5 py-0.5 rounded capitalize ${badge(d.status)}`}>{d.status}</span></td>
                    <td className="px-4 py-2.5 text-right">
                      {d.confirmed_at ? (
                        <button onClick={() => act("distribution", d.line_id, d.confirmed_at)} disabled={busy === d.line_id}
                          className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 hover:underline disabled:opacity-50">
                          <Check className="w-3.5 h-3.5" /> Confirmed
                        </button>
                      ) : (
                        <button onClick={() => act("distribution", d.line_id, null)} disabled={busy === d.line_id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-foreground/15 px-2.5 py-1 text-xs hover:bg-foreground/[0.04] disabled:opacity-50">
                          {busy === d.line_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null} Confirm
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground border border-foreground/10 rounded-lg p-6">No distributions have been made to you yet.</p>
        )}
      </section>
    </div>
  )
}
