"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { Plus, Loader2, ArrowRight } from "lucide-react"
import type { Loan } from "@/lib/modules/carta-modules"
import { MetricTiles, type Metric } from "@/components/data/metric-tiles"
import { DataTable } from "@/components/data/data-table"

const money = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${Math.round(v).toLocaleString()}`)
const fmtD = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", year: "numeric" }) : "—")
const AMORT: Record<string, string> = { bullet: "Bullet", amortizing: "Amortizing", interest_only: "Interest-only", revolving: "Revolving" }
const STATUS: Record<string, string> = { active: "Active", repaid: "Repaid", default: "Default", written_off: "Written off" }
const BADGE: Record<string, string> = { active: "bg-[#2f45e0]/10 text-[#2f45e0]", repaid: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", default: "bg-rose-500/10 text-rose-600 dark:text-rose-400", written_off: "bg-foreground/[0.06] text-muted-foreground" }

export function LoansClient({ initial }: { initial: Loan[] }) {
  const [loans, setLoans] = useState(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ borrower: "", principal: "", rate: "", origination: "", maturity: "", amortization: "bullet", status: "active" })

  const active = loans.filter((l) => l.status === "active")
  const summary: Metric[] = useMemo(() => {
    const outstanding = active.reduce((s, l) => s + (l.outstanding ?? l.principal), 0)
    const rates = active.map((l) => l.interest_rate).filter((r): r is number => r != null)
    const avg = rates.length ? rates.reduce((s, r) => s + r, 0) / rates.length : null
    return [
      { label: "Loans", value: loans.length },
      { label: "Outstanding", value: money(outstanding) },
      { label: "Avg rate", value: avg != null ? `${avg.toFixed(2)}%` : "—" },
      { label: "Active", value: active.length },
    ]
  }, [loans, active])

  async function create() {
    if (!f.borrower.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/loans", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ borrower: f.borrower, principal: Number(f.principal) || 0, rate: f.rate ? Number(f.rate) : null, origination: f.origination || null, maturity: f.maturity || null, amortization: f.amortization, status: f.status }) })
      const d = await res.json()
      if (d.loan) { setLoans((l) => [d.loan, ...l]); setF({ borrower: "", principal: "", rate: "", origination: "", maturity: "", amortization: "bullet", status: "active" }); setOpen(false) }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90"><Plus className="w-4 h-4" /> Originate loan</button>
      </div>
      <MetricTiles metrics={summary} columns={4} />

      {open && (
        <div className="mt-6 border border-foreground/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Originate a loan</h3>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <Field label="Borrower *"><input value={f.borrower} onChange={(e) => setF({ ...f, borrower: e.target.value })} className="inpL" placeholder="Acme Ltd" /></Field>
            <Field label="Principal ($)"><input value={f.principal} onChange={(e) => setF({ ...f, principal: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inpL tabular-nums" placeholder="0" /></Field>
            <Field label="Rate (%)"><input value={f.rate} onChange={(e) => setF({ ...f, rate: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className="inpL tabular-nums" placeholder="12.0" /></Field>
            <Field label="Origination"><input type="date" value={f.origination} onChange={(e) => setF({ ...f, origination: e.target.value })} className="inpL" /></Field>
            <Field label="Maturity"><input type="date" value={f.maturity} onChange={(e) => setF({ ...f, maturity: e.target.value })} className="inpL" /></Field>
            <Field label="Amortization"><select value={f.amortization} onChange={(e) => setF({ ...f, amortization: e.target.value })} className="inpL">{Object.entries(AMORT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={create} disabled={busy || !f.borrower.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Book loan</button>
            <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <DataTable
          rows={loans}
          getRowId={(l) => l.id}
          exportName="loans"
          searchPlaceholder="Search loans…"
          emptyText="No loans yet. Originate your first above."
          initialSort={{ key: "borrower", dir: "asc" }}
          columns={[
            { key: "borrower", header: "Borrower", value: (l) => l.borrower, render: (l) => <Link href={`/dashboard/loan-operations/${l.id}`} className="font-medium hover:underline">{l.borrower}</Link> },
            { key: "principal", header: "Principal", numeric: true, value: (l) => l.principal, render: (l) => <span className="tabular-nums">{money(l.principal)}</span>, total: (rs) => <span className="tabular-nums">{money(rs.reduce((s, l) => s + (l.principal ?? 0), 0))}</span> },
            { key: "rate", header: "Rate", numeric: true, value: (l) => l.interest_rate ?? null, render: (l) => <span className="tabular-nums">{l.interest_rate != null ? `${l.interest_rate}%` : "—"}</span> },
            { key: "maturity", header: "Maturity", value: (l) => l.maturity_date ?? "", render: (l) => <span className="text-muted-foreground">{fmtD(l.maturity_date)}</span> },
            { key: "amortization", header: "Amortization", value: (l) => AMORT[l.amortization] ?? l.amortization, render: (l) => <span className="text-muted-foreground">{AMORT[l.amortization] ?? l.amortization}</span> },
            { key: "status", header: "Status", value: (l) => STATUS[l.status] ?? l.status, render: (l) => <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${BADGE[l.status]}`}>{STATUS[l.status] ?? l.status}</span> },
            { key: "open", header: "", sortable: false, render: (l) => <Link href={`/dashboard/loan-operations/${l.id}`} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">Open <ArrowRight className="w-3 h-3" /></Link> },
          ]}
        />
      </div>
      <style>{`.inpL{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inpL:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
