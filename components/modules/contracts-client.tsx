"use client"

import { useMemo, useState } from "react"
import { Plus, Loader2 } from "lucide-react"
import type { Contract } from "@/lib/modules/carta-modules"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"
import { DataTable } from "@/components/data/data-table"

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

      <div className="mt-8">
        <DataTable
          rows={contracts}
          getRowId={(c) => c.id}
          exportName="contracts"
          searchPlaceholder="Search contracts…"
          emptyText="No contracts yet. Add your first above."
          initialSort={{ key: "title", dir: "asc" }}
          columns={[
            { key: "title", header: "Contract", value: (c) => c.title, render: (c) => <span className="font-medium">{c.title}</span> },
            { key: "counterparty", header: "Counterparty", value: (c) => c.counterparty ?? "", render: (c) => <span className="text-muted-foreground">{c.counterparty ?? "—"}</span> },
            { key: "type", header: "Type", value: (c) => c.contract_type ?? "", render: (c) => <span className="text-muted-foreground">{c.contract_type ?? "—"}</span> },
            { key: "value", header: "Value", numeric: true, value: (c) => c.value ?? null, render: (c) => <span className="tabular-nums">{money(c.value)}</span>, total: (rs) => <span className="tabular-nums">{money(rs.reduce((s, c) => s + (c.value ?? 0), 0))}</span> },
            { key: "expiry", header: "Expiry", value: (c) => c.expiry_date ?? "", render: (c) => <span className="text-muted-foreground">{fmtD(c.expiry_date)}</span> },
            { key: "status", header: "Status", value: (c) => STATUS[c.status] ?? c.status, render: (c) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${BADGE[c.status]}`}>{STATUS[c.status] ?? c.status}</span> },
          ]}
        />
      </div>
      <style>{`.inpC{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inpC:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
