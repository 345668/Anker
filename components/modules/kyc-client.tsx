"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Plus, Loader2, RefreshCw, ArrowRight } from "lucide-react"
import type { KycCase } from "@/lib/modules/kyc"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"
import { EmptyState } from "@/components/shell/empty-state"

const STATUS: Record<string, { label: string; cls: string }> = {
  not_started: { label: "Not started", cls: "bg-foreground/[0.06] text-muted-foreground" },
  in_progress: { label: "In progress", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  cleared: { label: "Cleared", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  escalated: { label: "Escalated", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  rejected: { label: "Rejected", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
}
const RISK: Record<string, { label: string; cls: string }> = {
  unknown: { label: "—", cls: "text-muted-foreground" },
  low: { label: "Low", cls: "text-emerald-600 dark:text-emerald-400" },
  medium: { label: "Medium", cls: "text-amber-600 dark:text-amber-400" },
  high: { label: "High", cls: "text-rose-600 dark:text-rose-400" },
}

export function KycClient({ initial }: { initial: KycCase[] }) {
  const [cases, setCases] = useState(initial)
  const [busy, setBusy] = useState<null | "sync" | "add">(null)
  const [showAdd, setShowAdd] = useState(false)
  const [f, setF] = useState({ subjectName: "", subjectType: "individual" })
  const [msg, setMsg] = useState<string | null>(null)

  const metrics: Metric[] = useMemo(() => [
    { label: "Cases", value: cases.length },
    { label: "Cleared", value: cases.filter((c) => c.status === "cleared").length },
    { label: "Escalated", value: cases.filter((c) => c.status === "escalated").length },
    { label: "High risk", value: cases.filter((c) => c.risk_level === "high").length },
  ], [cases])

  async function reload() {
    const d = await (await fetch("/api/kyc/cases")).json()
    if (d.cases) setCases(d.cases)
  }

  async function sync() {
    setBusy("sync"); setMsg(null)
    try {
      const res = await fetch("/api/kyc/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "sync" }) })
      const d = await res.json()
      if (d.cases) { setCases(d.cases); setMsg(d.created > 0 ? `Added ${d.created} case${d.created === 1 ? "" : "s"} from fund LPs.` : "All fund LPs already have cases.") }
      else setMsg(d.error ?? "Sync failed")
    } finally { setBusy(null) }
  }

  async function add() {
    if (!f.subjectName.trim()) return
    setBusy("add")
    try {
      const res = await fetch("/api/kyc/cases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) })
      const d = await res.json()
      if (d.case) { setCases((c) => [d.case, ...c]); setF({ subjectName: "", subjectType: "individual" }); setShowAdd(false) }
    } finally { setBusy(null) }
  }

  return (
    <div>
      <div className="flex items-center justify-end gap-2 mb-4">
        <button onClick={sync} disabled={busy === "sync"} className="inline-flex items-center gap-2 h-9 px-3.5 text-sm rounded-md border border-foreground/15 hover:border-foreground/40 disabled:opacity-50">
          {busy === "sync" ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Sync from fund LPs
        </button>
        <button onClick={() => setShowAdd((v) => !v)} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90">
          <Plus className="w-4 h-4" /> Add subject
        </button>
      </div>

      {msg && <p className="mb-3 text-sm text-muted-foreground">{msg}</p>}

      <MetricTiles metrics={metrics} columns={4} />

      {showAdd && (
        <div className="mt-6 border border-foreground/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Add a screening subject</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="flex flex-col gap-1.5 sm:col-span-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Legal name *</span>
              <input value={f.subjectName} onChange={(e) => setF({ ...f, subjectName: e.target.value })} className="inpK" placeholder="Acme Family Office" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">Type</span>
              <select value={f.subjectType} onChange={(e) => setF({ ...f, subjectType: e.target.value })} className="inpK">
                <option value="individual">Individual</option>
                <option value="entity">Entity</option>
              </select>
            </label>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={add} disabled={busy === "add" || !f.subjectName.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">{busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create case</button>
            <button onClick={() => setShowAdd(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-x-auto border border-foreground/10 rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
              <th className="text-left px-4 py-2.5">Subject</th>
              <th className="text-left px-4 py-2.5">Type</th>
              <th className="text-left px-4 py-2.5">Risk</th>
              <th className="text-left px-4 py-2.5">Status</th>
              <th className="text-right px-4 py-2.5">Hits</th>
              <th className="text-right px-4 py-2.5">Docs</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 ? (
              <tr><td colSpan={7} className="px-4"><EmptyState compact title="No screening cases yet" description="Sync from your fund LPs or add a subject to start." /></td></tr>
            ) : cases.map((c) => {
              const st = STATUS[c.status]; const rk = RISK[c.risk_level]
              return (
                <tr key={c.id} className="border-b border-foreground/[0.06] last:border-0 hover:bg-foreground/[0.02]">
                  <td className="px-4 py-2.5 font-medium"><Link href={`/dashboard/kyc-aml/${c.id}`} className="hover:underline">{c.subject_name}</Link></td>
                  <td className="px-4 py-2.5 text-muted-foreground capitalize">{c.subject_type}</td>
                  <td className="px-4 py-2.5"><span className={`text-[13px] font-medium ${rk.cls}`}>{rk.label}</span></td>
                  <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{c.open_hits ? <span className="text-rose-600 font-medium">{c.open_hits}</span> : <span className="text-muted-foreground">0</span>}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{c.docs_verified ?? 0}/{c.docs_required ?? 0}</td>
                  <td className="px-4 py-2.5 text-right"><Link href={`/dashboard/kyc-aml/${c.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Open <ArrowRight className="w-3 h-3" /></Link></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <style>{`.inpK{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inpK:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}
