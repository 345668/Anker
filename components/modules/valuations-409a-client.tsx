"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Plus, Loader2, ArrowRight } from "lucide-react"
import type { Valuation409a } from "@/lib/modules/carta-modules"

const money = (v: number | null) => (v == null ? "—" : `$${Math.round(v).toLocaleString()}`)
const fmtD = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")
const STATUS: Record<string, string> = { requested: "Requested", in_progress: "In progress", completed: "Completed", board_approved: "Board approved", expired: "Expired" }
const BADGE: Record<string, string> = {
  board_approved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  completed: "bg-[#2f45e0]/10 text-[#2f45e0]",
  in_progress: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  requested: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  expired: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
}

export function Valuations409aClient({ initial }: { initial: Valuation409a[] }) {
  const [vals, setVals] = useState(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ method: "OPM", commonPrice: "", fmv: "", status: "requested" })

  const current = useMemo(() => vals.find((v) => v.status === "board_approved") ?? vals.find((v) => v.status === "completed") ?? null, [vals])

  async function create() {
    setBusy(true)
    try {
      const res = await fetch("/api/valuations-409a", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method: f.method, commonPrice: f.commonPrice ? Number(f.commonPrice) : null, fmv: f.fmv ? Number(f.fmv) : null, status: f.status }) })
      const d = await res.json()
      if (d.valuation) { setVals((v) => [d.valuation, ...v]); setF({ method: "OPM", commonPrice: "", fmv: "", status: "requested" }); setOpen(false) }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c]"><Plus className="w-4 h-4" /> Request valuation</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden">
        <Tile label="Current FMV" value={money(current?.fair_market_value ?? null)} />
        <Tile label="Common price" value={current?.common_price != null ? `$${current.common_price}` : "—"} />
        <Tile label="Status" value={current ? STATUS[current.status] : "None yet"} />
        <Tile label="Valuations on file" value={String(vals.length)} />
      </div>

      {open && (
        <div className="mt-6 border border-foreground/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Request a 409A valuation</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Field label="Method"><select value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })} className="inp3">{["OPM", "Backsolve", "PWERM", "Market"].map((m) => <option key={m}>{m}</option>)}</select></Field>
            <Field label="Common price ($)"><input value={f.commonPrice} onChange={(e) => setF({ ...f, commonPrice: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inp3 tabular-nums" placeholder="0.10" /></Field>
            <Field label="FMV ($)"><input value={f.fmv} onChange={(e) => setF({ ...f, fmv: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inp3 tabular-nums" placeholder="optional" /></Field>
            <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="inp3">{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={create} disabled={busy} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c] disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Submit request</button>
            <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-x-auto border border-foreground/10 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2.5">Requested</th>
              <th className="text-left px-4 py-2.5">Method</th>
              <th className="text-right px-4 py-2.5">Common price</th>
              <th className="text-right px-4 py-2.5">FMV</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {vals.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No valuations yet. Request your first 409A above.</td></tr>
            ) : vals.map((v) => (
              <tr key={v.id} className="border-b border-foreground/[0.06] last:border-0 hover:bg-foreground/[0.02]">
                <td className="px-4 py-2.5 text-muted-foreground"><Link href={`/dashboard/valuations-409a/${v.id}`} className="hover:underline">{fmtD(v.created_at)}</Link></td>
                <td className="px-4 py-2.5">{v.method}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{v.common_price != null ? `$${v.common_price}` : "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(v.fair_market_value)}</td>
                <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${BADGE[v.status]}`}>{STATUS[v.status]}</span></td>
                <td className="px-4 py-2.5 text-right"><Link href={`/dashboard/valuations-409a/${v.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Open <ArrowRight className="w-3 h-3" /></Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`.inp3{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inp3:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return <div className="bg-background p-3.5"><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{value}</div></div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
