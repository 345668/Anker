"use client"

import { useMemo, useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import type { Spv } from "@/lib/modules/carta-modules"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const STAGE: Record<string, string> = { forming: "Forming", open: "Open", closed: "Closed", wound_down: "Wound down" }
const BADGE: Record<string, string> = {
  forming: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  open: "bg-[#2f45e0]/10 text-[#2f45e0]",
  closed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  wound_down: "bg-foreground/[0.06] text-muted-foreground",
}

export function SpvsClient({ initial }: { initial: Spv[] }) {
  const [spvs, setSpvs] = useState(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ name: "", dealName: "", target: "", committed: "", stage: "forming", lead: "", closeDate: "" })

  const summary: Metric[] = useMemo(() => [
    { label: "SPVs", value: spvs.length },
    { label: "Total target", value: money(spvs.reduce((s, x) => s + x.target_amount, 0)) },
    { label: "Committed", value: money(spvs.reduce((s, x) => s + x.committed_amount, 0)) },
    { label: "Closed", value: spvs.filter((x) => x.stage === "closed").length },
  ], [spvs])

  async function create() {
    if (!f.name.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/spvs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name, dealName: f.dealName || null, target: Number(f.target) || 0, committed: Number(f.committed) || 0, stage: f.stage, lead: f.lead || null, closeDate: f.closeDate || null }) })
      const d = await res.json()
      if (d.spv) { setSpvs((s) => [d.spv, ...s]); setF({ name: "", dealName: "", target: "", committed: "", stage: "forming", lead: "", closeDate: "" }); setOpen(false) }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
          <Plus className="w-4 h-4" /> New SPV
        </button>
      </div>

      <MetricTiles metrics={summary} columns={4} />

      {open && (
        <div className="mt-6 border border-foreground/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Form an SPV</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Name *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="inp" placeholder="Acme SPV I" /></Field>
            <Field label="Deal"><input value={f.dealName} onChange={(e) => setF({ ...f, dealName: e.target.value })} className="inp" placeholder="Acme Labs — Series A" /></Field>
            <Field label="Lead"><input value={f.lead} onChange={(e) => setF({ ...f, lead: e.target.value })} className="inp" placeholder="Deal lead" /></Field>
            <Field label="Target ($)"><input value={f.target} onChange={(e) => setF({ ...f, target: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inp tabular-nums" placeholder="0" /></Field>
            <Field label="Committed ($)"><input value={f.committed} onChange={(e) => setF({ ...f, committed: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inp tabular-nums" placeholder="0" /></Field>
            <Field label="Stage">
              <select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} className="inp">
                {Object.entries(STAGE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </Field>
            <Field label="Close date"><input type="date" value={f.closeDate} onChange={(e) => setF({ ...f, closeDate: e.target.value })} className="inp" /></Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={create} disabled={busy || !f.name.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create SPV</button>
            <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-x-auto border border-foreground/10 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2.5">SPV</th>
              <th className="text-left px-4 py-2.5">Deal</th>
              <th className="text-right px-4 py-2.5">Target</th>
              <th className="text-right px-4 py-2.5">Committed</th>
              <th className="text-right px-4 py-2.5">%</th>
              <th className="text-left px-4 py-2.5">Stage</th>
              <th className="text-left px-4 py-2.5">Close</th>
            </tr>
          </thead>
          <tbody>
            {spvs.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-sm text-muted-foreground">No SPVs yet. Click “New SPV” to form your first.</td></tr>
            ) : spvs.map((s) => (
              <tr key={s.id} className="border-b border-foreground/[0.06] last:border-0">
                <td className="px-4 py-2.5 font-medium">{s.name}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{s.deal_name ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(s.target_amount)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(s.committed_amount)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{s.target_amount > 0 ? `${Math.round((s.committed_amount / s.target_amount) * 100)}%` : "—"}</td>
                <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${BADGE[s.stage]}`}>{STAGE[s.stage]}</span></td>
                <td className="px-4 py-2.5 text-muted-foreground">{s.close_date ? new Date(s.close_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`.inp{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inp:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
