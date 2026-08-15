"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Plus, Loader2, Trash2, Check } from "lucide-react"
import type { Spv } from "@/lib/modules/carta-modules"
import type { SpvSubscription, SpvRollup, SpvStage, SpvSubStatus } from "@/lib/modules/spv-lifecycle"
import { EmptyState } from "@/components/shell/empty-state"

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const fmtD = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

const STAGES: { value: SpvStage; label: string }[] = [
  { value: "forming", label: "Forming" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "wound_down", label: "Wound down" },
]
const SUB_STATUS: { value: SpvSubStatus; label: string }[] = [
  { value: "invited", label: "Invited" },
  { value: "committed", label: "Committed" },
  { value: "signed", label: "Signed" },
  { value: "funded", label: "Funded" },
  { value: "declined", label: "Declined" },
]
const FUNNEL_TINT: Record<string, string> = { invited: "#c7d0f7", committed: "#8fa2ef", signed: "#5470e6", funded: "#2f45e0" }
const SUB_BADGE: Record<string, string> = {
  invited: "text-muted-foreground",
  committed: "text-[#2f45e0]",
  signed: "text-[#2f45e0]",
  funded: "text-emerald-600 dark:text-emerald-400",
  declined: "text-rose-600 dark:text-rose-400 line-through",
}

export function SpvDetailClient({
  initialSpv, initialSubs, initialRollup,
}: {
  initialSpv: Spv
  initialSubs: SpvSubscription[]
  initialRollup: SpvRollup
}) {
  const [spv, setSpv] = useState(initialSpv)
  const [subs, setSubs] = useState(initialSubs)
  const [rollup, setRollup] = useState(initialRollup)
  const [busy, setBusy] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [f, setF] = useState({ investorName: "", investorEmail: "", amount: "", status: "invited", subscribedAt: "" })

  function applyResp(d: any) {
    if (d.spv) setSpv(d.spv)
    if (d.rollup) setRollup(d.rollup)
  }

  async function setStage(stage: SpvStage) {
    setBusy(true)
    try {
      const res = await fetch(`/api/spvs/${spv.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ stage }) })
      applyResp(await res.json())
    } finally { setBusy(false) }
  }

  async function addSub() {
    if (!f.investorName.trim()) return
    setBusy(true)
    try {
      const res = await fetch(`/api/spvs/${spv.id}/subscriptions`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ investorName: f.investorName, investorEmail: f.investorEmail || null, amount: Number(f.amount) || 0, status: f.status, subscribedAt: f.subscribedAt || null }),
      })
      const d = await res.json()
      if (d.subscription) {
        setSubs((s) => [d.subscription, ...s])
        applyResp(d)
        setF({ investorName: "", investorEmail: "", amount: "", status: "invited", subscribedAt: "" })
        setShowAdd(false)
      }
    } finally { setBusy(false) }
  }

  async function patchSub(subId: string, patch: any) {
    const res = await fetch(`/api/spvs/${spv.id}/subscriptions/${subId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) })
    const d = await res.json()
    if (d.subscription) { setSubs((s) => s.map((x) => (x.id === subId ? d.subscription : x))); applyResp(d) }
  }

  async function removeSub(subId: string) {
    if (!confirm("Remove this subscription?")) return
    const res = await fetch(`/api/spvs/${spv.id}/subscriptions/${subId}`, { method: "DELETE" })
    const d = await res.json()
    if (d.ok) { setSubs((s) => s.filter((x) => x.id !== subId)); applyResp(d) }
  }

  const pct = rollup.pct_subscribed != null ? Math.min(100, rollup.pct_subscribed * 100) : 0

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <Link href="/dashboard/spvs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> All SPVs
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <span className="w-2.5 h-2.5 bg-[#2f45e0]" /> SPV{spv.deal_name ? ` · ${spv.deal_name}` : ""}
          </div>
          <h1 className="text-3xl font-display tracking-tight">{spv.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{spv.lead ? `Lead: ${spv.lead} · ` : ""}Close {fmtD(spv.close_date)}</p>
        </div>
        <Link href={`/dashboard/spvs/${spv.id}/waterfall`} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md border border-foreground/15 hover:border-foreground/40">
          Cap table &amp; waterfall <ArrowRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Stage stepper */}
      <div className="mb-8">
        <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Lifecycle</div>
        <div className="flex flex-wrap items-center gap-2">
          {STAGES.map((st, i) => {
            const active = spv.stage === st.value
            return (
              <button
                key={st.value}
                onClick={() => setStage(st.value)}
                disabled={busy}
                className={`inline-flex items-center gap-2 h-9 px-3.5 rounded-md text-sm border transition-colors disabled:opacity-50 ${active ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-muted-foreground hover:text-foreground hover:border-foreground/40"}`}
              >
                <span className={`font-mono text-[10px] ${active ? "opacity-70" : "opacity-50"}`}>{i + 1}</span>
                {st.label}
                {active && <Check className="w-3.5 h-3.5" />}
              </button>
            )
          })}
        </div>
      </div>

      {/* Rollup tiles */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden mb-6">
        <Tile label="Target" value={money(spv.target_amount)} />
        <Tile label="Committed" value={money(rollup.committed)} />
        <Tile label="Funded" value={money(rollup.funded)} />
        <Tile label="% subscribed" value={rollup.pct_subscribed != null ? `${(rollup.pct_subscribed * 100).toFixed(1)}%` : "—"} />
        <Tile label="Investors" value={String(rollup.investors)} />
      </section>

      {/* Progress bar */}
      <div className="mb-8">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full" style={{ width: `${pct}%`, background: "#2f45e0" }} />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{money(rollup.committed)} committed of {money(spv.target_amount)} target</div>
      </div>

      {/* Funnel tiles */}
      <h2 className="font-display text-lg tracking-tight mb-3">Subscription funnel</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {rollup.funnel.map((s) => (
          <div key={s.status} className="border border-foreground/10 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-sm" style={{ background: FUNNEL_TINT[s.status] }} />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{s.status}</span>
            </div>
            <div className="text-2xl font-display tabular-nums">{money(s.amount)}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{s.count} investor{s.count === 1 ? "" : "s"}</div>
          </div>
        ))}
      </div>

      {/* Subscription book */}
      <section className="border border-foreground/10 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
          <h2 className="font-display text-lg tracking-tight">Subscription book</h2>
          <button onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-2 h-8 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
            <Plus className="w-4 h-4" /> Add investor
          </button>
        </div>

        {showAdd && (
          <div className="px-5 py-4 border-b border-foreground/10 bg-foreground/[0.02]">
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <Field label="Investor *"><input value={f.investorName} onChange={(e) => setF({ ...f, investorName: e.target.value })} className="inpS" placeholder="Acme Family Office" /></Field>
              <Field label="Email"><input value={f.investorEmail} onChange={(e) => setF({ ...f, investorEmail: e.target.value })} className="inpS" placeholder="lp@acme.com" /></Field>
              <Field label="Amount ($)"><input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inpS tabular-nums" placeholder="0" /></Field>
              <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="inpS">{SUB_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
              <Field label="Subscribed"><input type="date" value={f.subscribedAt} onChange={(e) => setF({ ...f, subscribedAt: e.target.value })} className="inpS" /></Field>
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={addSub} disabled={busy || !f.investorName.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add</button>
              <button onClick={() => setShowAdd(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}

        {subs.length === 0 ? (
          <EmptyState title="No investors yet" description="Add investors to build this SPV's subscription book." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-foreground/[0.02] text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-2 font-normal">Investor</th>
                  <th className="text-left px-4 py-2 font-normal">Email</th>
                  <th className="text-right px-4 py-2 font-normal">Amount</th>
                  <th className="text-left px-4 py-2 font-normal">Status</th>
                  <th className="text-left px-4 py-2 font-normal">Subscribed</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="border-t border-foreground/[0.06] hover:bg-foreground/[0.02]">
                    <td className="px-4 py-2 font-medium">{s.investor_name}</td>
                    <td className="px-4 py-2 text-muted-foreground font-mono text-xs">{s.investor_email ?? "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <input
                        defaultValue={s.amount || ""}
                        onBlur={(e) => { const v = Number(e.target.value.replace(/[^0-9.]/g, "")) || 0; if (v !== s.amount) patchSub(s.id, { amount: v }) }}
                        inputMode="decimal"
                        className="w-28 h-7 px-2 text-xs border border-foreground/15 rounded bg-background text-right font-mono"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <select value={s.status} onChange={(e) => patchSub(s.id, { status: e.target.value })} className={`h-7 px-1 text-[11px] border border-foreground/15 rounded bg-background ${SUB_BADGE[s.status] ?? ""}`}>
                        {SUB_STATUS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{fmtD(s.subscribed_at)}</td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => removeSub(s.id)} className="text-xs px-2 py-1 rounded border border-rose-500/30 text-rose-600 hover:bg-rose-500/5"><Trash2 className="w-3 h-3" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <style>{`.inpS{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inpS:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-background px-4 py-3.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-display tabular-nums">{value}</div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
