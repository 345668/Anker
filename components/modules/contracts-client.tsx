"use client"

import { useMemo, useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import type { Contract } from "@/lib/modules/carta-modules"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"

const money = (v: number | null) => (v == null ? "—" : v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const fmtD = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")
const STATUS: Record<string, string> = { draft: "Draft", in_review: "In review", sent: "Sent", signed: "Signed", expired: "Expired" }
const BADGE: Record<string, string> = { signed: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", in_review: "bg-amber-500/10 text-amber-600 dark:text-amber-400", sent: "bg-[#2f45e0]/10 text-[#2f45e0]", draft: "bg-foreground/[0.06] text-muted-foreground", expired: "bg-rose-500/10 text-rose-600 dark:text-rose-400" }

export function ContractsClient({ initial }: { initial: Contract[] }) {
  const [contracts, setContracts] = useState(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ title: "", counterparty: "", type: "NDA", status: "draft", value: "", effective: "", expiry: "" })

  const summary: Metric[] = useMemo(() => [
    { label: "Contracts", value: contracts.length },
    { label: "In review", value: contracts.filter((c) => c.status === "in_review").length },
    { label: "Signed", value: contracts.filter((c) => c.status === "signed").length },
    { label: "Total value", value: money(contracts.reduce((s, c) => s + (c.value ?? 0), 0)) },
  ], [contracts])

  async function create() {
    if (!f.title.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/contracts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: f.title, counterparty: f.counterparty || null, type: f.type || null, status: f.status, value: f.value ? Number(f.value) : null, effective: f.effective || null, expiry: f.expiry || null }) })
      const d = await res.json()
      if (d.contract) { setContracts((c) => [d.contract, ...c]); setF({ title: "", counterparty: "", type: "NDA", status: "draft", value: "", effective: "", expiry: "" }); setOpen(false) }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90"><Plus className="w-4 h-4" /> New contract</button>
      </div>
      <MetricTiles metrics={summary} columns={4} />

      {open && (
        <div className="mt-6 border border-foreground/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Add a contract</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Title *"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="inpC" placeholder="Mutual NDA — Acme" /></Field>
            <Field label="Counterparty"><input value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} className="inpC" placeholder="Acme Ltd" /></Field>
            <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="inpC">{["NDA", "MSA", "SAFE", "Side Letter", "Subscription", "Term Sheet", "SOW", "Other"].map((t) => <option key={t}>{t}</option>)}</select></Field>
            <Field label="Status"><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="inpC">{Object.entries(STATUS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
            <Field label="Value ($)"><input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inpC tabular-nums" placeholder="optional" /></Field>
            <Field label="Expiry"><input type="date" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} className="inpC" /></Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={create} disabled={busy || !f.title.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add contract</button>
            <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-8 overflow-x-auto border border-foreground/10 rounded-lg">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <th className="text-left px-4 py-2.5">Contract</th><th className="text-left px-4 py-2.5">Counterparty</th><th className="text-left px-4 py-2.5">Type</th><th className="text-right px-4 py-2.5">Value</th><th className="text-left px-4 py-2.5">Expiry</th><th className="text-left px-4 py-2.5">Status</th>
          </tr></thead>
          <tbody>
            {contracts.length === 0 ? <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">No contracts yet. Add your first above.</td></tr>
            : contracts.map((c) => (
              <tr key={c.id} className="border-b border-foreground/[0.06] last:border-0">
                <td className="px-4 py-2.5 font-medium">{c.title}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{c.counterparty ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{c.contract_type ?? "—"}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{money(c.value)}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{fmtD(c.expiry_date)}</td>
                <td className="px-4 py-2.5"><span className={`text-[11px] font-medium px-2 py-0.5 rounded ${BADGE[c.status]}`}>{STATUS[c.status]}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <style>{`.inpC{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inpC:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
