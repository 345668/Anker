"use client"

import { useMemo, useState } from "react"
import { Plus, Loader2, Check } from "lucide-react"
import type { EquityFiling } from "@/lib/modules/carta-modules"
import { DataTable } from "@/components/data/data-table"

const statusLabel = (x: EquityFiling) => (x.status === "filed" ? "Filed" : x.status === "open" && x.due_date != null && new Date(x.due_date).getTime() < Date.now() ? "Overdue" : "Open")

const fmtD = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")
const isOverdue = (f: EquityFiling) => f.status === "open" && f.due_date != null && new Date(f.due_date).getTime() < Date.now()

export function EquityComplianceClient({ initial }: { initial: EquityFiling[] }) {
  const [filings, setFilings] = useState(initial)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ title: "", filingType: "", dueDate: "" })

  const openCount = filings.filter((x) => x.status === "open").length
  const overdue = useMemo(() => filings.filter(isOverdue).length, [filings])
  const filed = filings.filter((x) => x.status === "filed").length

  async function create() {
    if (!f.title.trim()) return
    setBusy(true)
    try {
      const res = await fetch("/api/equity-filings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: f.title, filingType: f.filingType || null, dueDate: f.dueDate || null }) })
      const d = await res.json()
      if (d.filing) { setFilings((x) => [d.filing, ...x]); setF({ title: "", filingType: "", dueDate: "" }); setOpen(false) }
    } catch { /* ignore */ } finally { setBusy(false) }
  }

  return (
    <div>
      <div className="flex items-center justify-end mb-4">
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c]"><Plus className="w-4 h-4" /> Add filing</button>
      </div>

      <div className="grid grid-cols-3 gap-px bg-foreground/10 border border-foreground/10 rounded-lg overflow-hidden">
        <Tile label="Open" value={String(openCount)} />
        <Tile label="Overdue" value={String(overdue)} tone={overdue > 0 ? "rose" : undefined} />
        <Tile label="Filed" value={String(filed)} tone="emerald" />
      </div>

      {open && (
        <div className="mt-6 border border-foreground/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold mb-4">Add a filing to the register</h3>
          <div className="grid sm:grid-cols-3 gap-3">
            <Field label="Title *"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} className="inp4" placeholder="Confirmation statement" /></Field>
            <Field label="Type"><input value={f.filingType} onChange={(e) => setF({ ...f, filingType: e.target.value })} className="inp4" placeholder="Companies House · SH01 · PSC" /></Field>
            <Field label="Due date"><input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} className="inp4" /></Field>
          </div>
          <div className="flex gap-3 mt-4">
            <button onClick={create} disabled={busy || !f.title.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c] disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add filing</button>
            <button onClick={() => setOpen(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
          </div>
        </div>
      )}

      <div className="mt-8">
        <DataTable
          rows={filings}
          getRowId={(x) => x.id}
          exportName="equity-filings"
          searchPlaceholder="Search filings…"
          emptyText="No filings tracked yet. Add your registers and deadlines above."
          initialSort={{ key: "due", dir: "asc" }}
          columns={[
            { key: "filing", header: "Filing", value: (x) => x.title, render: (x) => <span className="font-medium">{x.title}</span> },
            { key: "type", header: "Type", value: (x) => x.filing_type ?? "", render: (x) => <span className="text-muted-foreground">{x.filing_type ?? "—"}</span> },
            { key: "due", header: "Due", value: (x) => x.due_date ?? "", render: (x) => { const over = isOverdue(x); return <span className={over ? "text-rose-600 dark:text-rose-400 font-medium" : "text-muted-foreground"}>{fmtD(x.due_date)}</span> } },
            { key: "status", header: "Status", value: (x) => statusLabel(x), render: (x) => {
              const over = isOverdue(x)
              return x.status === "filed" ? <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><Check className="w-3 h-3" /> Filed</span>
                : over ? <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400">Overdue</span>
                : <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">Open</span>
            } },
          ]}
        />
      </div>
      <style>{`.inp4{width:100%;height:2.25rem;padding:0 .75rem;border:1px solid rgb(128 128 128 / .18);border-radius:.5rem;background:var(--color-background);font-size:.875rem}.inp4:focus{outline:none;border-color:rgb(128 128 128 / .5)}`}</style>
    </div>
  )
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "rose" }) {
  return <div className="bg-background p-3.5"><div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div><div className={`mt-1 text-lg font-semibold tabular-nums ${tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : tone === "rose" ? "text-rose-600 dark:text-rose-400" : ""}`}>{value}</div></div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
