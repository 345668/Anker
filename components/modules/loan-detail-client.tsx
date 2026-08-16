"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Plus, Loader2, Trash2, Check } from "lucide-react"
import type { LoanFull, LoanServicing, LoanPayment, LoanCovenant } from "@/lib/modules/loan-servicing"
import { EmptyState } from "@/components/shell/empty-state"

const ACCENT = "#2f45e0"
const money = (v: number) => {
  const s = v < 0 ? "-" : ""; const a = Math.abs(v)
  if (a >= 1e6) return `${s}$${(a / 1e6).toFixed(2)}M`
  if (a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}K`
  return `${s}$${a.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
}
const money2 = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtD = (s: string | null) => (s ? new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

const STATUS: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-[#2f45e0]/10 text-[#2f45e0]" },
  repaid: { label: "Repaid", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  default: { label: "Default", cls: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  written_off: { label: "Written off", cls: "bg-foreground/[0.06] text-muted-foreground" },
}
const STATUS_OPTS: LoanFull["status"][] = ["active", "repaid", "default", "written_off"]
const AMORT_OPTS: { v: LoanFull["amortization"]; l: string }[] = [
  { v: "amortizing", l: "Amortizing" }, { v: "interest_only", l: "Interest-only" },
  { v: "bullet", l: "Bullet" }, { v: "revolving", l: "Revolving" },
]
const FREQ_OPTS: { v: LoanFull["payment_frequency"]; l: string }[] = [
  { v: "monthly", l: "Monthly" }, { v: "quarterly", l: "Quarterly" },
  { v: "semiannual", l: "Semiannual" }, { v: "annual", l: "Annual" }, { v: "bullet", l: "Bullet" },
]
const PAY_KIND: { v: LoanPayment["kind"]; l: string }[] = [
  { v: "scheduled", l: "Scheduled" }, { v: "interest", l: "Interest only" },
  { v: "prepayment", l: "Prepayment" }, { v: "payoff", l: "Payoff" },
]
const COV_KIND: { v: LoanCovenant["kind"]; l: string }[] = [
  { v: "financial", l: "Financial" }, { v: "reporting", l: "Reporting" },
  { v: "affirmative", l: "Affirmative" }, { v: "negative", l: "Negative" },
]
const COV_STATUS: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400", at_risk: "text-amber-600 dark:text-amber-400",
  breached: "text-rose-600 dark:text-rose-400", waived: "text-muted-foreground",
}

export function LoanDetailClient({
  initialLoan, initialServicing, initialPayments, initialCovenants,
}: {
  initialLoan: LoanFull
  initialServicing: LoanServicing
  initialPayments: LoanPayment[]
  initialCovenants: LoanCovenant[]
}) {
  const [loan, setLoan] = useState(initialLoan)
  const [svc, setSvc] = useState(initialServicing)
  const [pays, setPays] = useState(initialPayments)
  const [covs, setCovs] = useState(initialCovenants)
  const [busy, setBusy] = useState(false)
  const [showPay, setShowPay] = useState(false)
  const [showCov, setShowCov] = useState(false)
  const [pf, setPf] = useState({ paidOn: new Date().toISOString().slice(0, 10), amount: "", kind: "scheduled", note: "" })
  const [cf, setCf] = useState({ name: "", kind: "financial", requirement: "" })

  function apply(d: any) { if (d.loan) setLoan(d.loan); if (d.servicing) setSvc(d.servicing) }

  async function patchLoan(body: any) {
    setBusy(true)
    try { apply(await (await fetch(`/api/loans/${loan.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })).json()) }
    finally { setBusy(false) }
  }
  async function addPay() {
    if (!pf.amount) return
    setBusy(true)
    try {
      const res = await fetch(`/api/loans/${loan.id}/payments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paidOn: pf.paidOn, amount: Number(pf.amount), kind: pf.kind, note: pf.note || null }) })
      const d = await res.json()
      if (d.payment) { setPays((p) => [...p, d.payment].sort((a, b) => a.paid_on.localeCompare(b.paid_on))); apply(d); setPf({ paidOn: new Date().toISOString().slice(0, 10), amount: "", kind: "scheduled", note: "" }); setShowPay(false) }
    } finally { setBusy(false) }
  }
  async function delPay(pid: string) {
    const d = await (await fetch(`/api/loans/${loan.id}/payments/${pid}`, { method: "DELETE" })).json()
    if (d.ok) { setPays((p) => p.filter((x) => x.id !== pid)); apply(d) }
  }
  async function addCov() {
    if (!cf.name.trim()) return
    const d = await (await fetch(`/api/loans/${loan.id}/covenants`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cf) })).json()
    if (d.covenants) { setCovs(d.covenants); setCf({ name: "", kind: "financial", requirement: "" }); setShowCov(false) }
  }
  async function setCov(cid: string, status: string) {
    const d = await (await fetch(`/api/loans/${loan.id}/covenants/${cid}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) })).json()
    if (d.covenants) setCovs(d.covenants)
  }
  async function delCov(cid: string) {
    const d = await (await fetch(`/api/loans/${loan.id}/covenants/${cid}`, { method: "DELETE" })).json()
    if (d.covenants) setCovs(d.covenants)
  }

  const st = STATUS[loan.status]
  const pctPaid = loan.principal > 0 ? Math.min(100, (svc.principalPaid / loan.principal) * 100) : 0
  const input = "w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background outline-none focus:border-foreground/40"

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <Link href="/dashboard/loan-operations" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> Loan Operations
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <span className="w-2.5 h-2.5" style={{ background: ACCENT }} /> Private credit · loan
          </div>
          <h1 className="text-3xl font-display tracking-tight">{loan.borrower}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {AMORT_OPTS.find((a) => a.v === loan.amortization)?.l} · {loan.interest_rate ?? 0}% · originated {fmtD(loan.origination_date)} · matures {fmtD(loan.maturity_date)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
          <select value={loan.status} onChange={(e) => patchLoan({ status: e.target.value })} disabled={busy} className="h-9 px-2 text-sm border border-foreground/15 rounded-md bg-background">
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
        </div>
      </div>

      {/* Summary tiles */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden mb-4">
        <Tile label="Principal" value={money(loan.principal)} />
        <Tile label="Outstanding" value={money(svc.outstanding)} />
        <Tile label="Rate" value={`${loan.interest_rate ?? 0}%`} />
        <Tile label="Accrued interest" value={money2(svc.accruedInterest)} sub="since last payment" />
        <Tile label="Interest paid" value={money(svc.interestPaid)} sub={`${money(svc.totalPaid)} total`} />
      </section>

      {/* Repayment progress */}
      <div className="mb-8">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]">
          <div className="h-full" style={{ width: `${pctPaid}%`, background: ACCENT }} />
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{money(svc.principalPaid)} of {money(loan.principal)} principal repaid{svc.nextDue ? ` · next payment ${fmtD(svc.nextDue.date)} (${money2(svc.nextDue.payment)})` : ""}</div>
      </div>

      {/* Terms */}
      <section className="mb-8 border border-foreground/10 rounded-xl p-5">
        <h2 className="font-display text-lg tracking-tight mb-4">Terms</h2>
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="Rate %"><input defaultValue={loan.interest_rate ?? ""} onBlur={(e) => { const v = Number(e.target.value); if (v !== loan.interest_rate) patchLoan({ rate: v }) }} className={input} /></Field>
          <Field label="Maturity"><input type="date" defaultValue={loan.maturity_date ?? ""} onBlur={(e) => { if (e.target.value !== loan.maturity_date) patchLoan({ maturity: e.target.value }) }} className={input} /></Field>
          <Field label="Amortization"><select value={loan.amortization} onChange={(e) => patchLoan({ amortization: e.target.value })} className={input}>{AMORT_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></Field>
          <Field label="Frequency"><select value={loan.payment_frequency} onChange={(e) => patchLoan({ frequency: e.target.value })} className={input}>{FREQ_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></Field>
        </div>
      </section>

      {/* Amortization schedule */}
      <section className="mb-8">
        <h2 className="font-display text-lg tracking-tight mb-3">Amortization schedule</h2>
        {svc.schedule.length === 0 ? (
          <div className="rounded-lg border border-foreground/10 p-5 text-sm text-muted-foreground">
            {loan.amortization === "revolving" ? "Revolving line — no fixed schedule; interest accrues on the drawn balance." : "Set an origination date, maturity, rate, and frequency to project the schedule."}
          </div>
        ) : (
          <div className="overflow-x-auto border border-foreground/10 rounded-lg max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2.5">#</th><th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-right px-4 py-2.5">Payment</th><th className="text-right px-4 py-2.5">Interest</th>
                  <th className="text-right px-4 py-2.5">Principal</th><th className="text-right px-4 py-2.5">Balance</th>
                </tr>
              </thead>
              <tbody>
                {svc.schedule.map((r) => (
                  <tr key={r.n} className="border-b border-foreground/[0.06] last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">{r.n}</td>
                    <td className="px-4 py-2">{fmtD(r.date)}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{money2(r.payment)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{money2(r.interest)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money2(r.principal)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{money2(r.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Payments */}
      <section className="mb-8 border border-foreground/10 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
          <h2 className="font-display text-lg tracking-tight">Payments</h2>
          <button onClick={() => setShowPay((v) => !v)} className="inline-flex items-center gap-2 h-8 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90"><Plus className="w-4 h-4" /> Record payment</button>
        </div>
        {showPay && (
          <div className="px-5 py-4 border-b border-foreground/10 bg-foreground/[0.02]">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Date"><input type="date" value={pf.paidOn} onChange={(e) => setPf({ ...pf, paidOn: e.target.value })} className={input} /></Field>
              <Field label="Amount ($)"><input value={pf.amount} onChange={(e) => setPf({ ...pf, amount: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" className={`${input} tabular-nums`} placeholder="0" /></Field>
              <Field label="Kind"><select value={pf.kind} onChange={(e) => setPf({ ...pf, kind: e.target.value })} className={input}>{PAY_KIND.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></Field>
              <Field label="Note"><input value={pf.note} onChange={(e) => setPf({ ...pf, note: e.target.value })} className={input} /></Field>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">The amount is split into accrued interest first, then principal (interest-only pays interest only).</p>
            <div className="flex gap-3 mt-3">
              <button onClick={addPay} disabled={busy || !pf.amount} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Record</button>
              <button onClick={() => setShowPay(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}
        {pays.length === 0 ? (
          <EmptyState title="No payments recorded" description="Record a payment to draw down the balance." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-foreground/[0.02] text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              <tr><th className="text-left px-4 py-2 font-normal">Date</th><th className="text-left px-4 py-2 font-normal">Kind</th><th className="text-right px-4 py-2 font-normal">Amount</th><th className="text-right px-4 py-2 font-normal">Interest</th><th className="text-right px-4 py-2 font-normal">Principal</th><th /></tr>
            </thead>
            <tbody>
              {pays.map((p) => (
                <tr key={p.id} className="border-t border-foreground/[0.06]">
                  <td className="px-4 py-2">{fmtD(p.paid_on)}</td>
                  <td className="px-4 py-2 text-muted-foreground capitalize">{p.kind}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-medium">{money2(p.amount)}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{money2(p.interest_portion)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{money2(p.principal_portion)}</td>
                  <td className="px-4 py-2 text-right"><button onClick={() => delPay(p.id)} className="text-xs px-2 py-1 rounded border border-rose-500/30 text-rose-600 hover:bg-rose-500/5"><Trash2 className="w-3 h-3" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Covenants */}
      <section className="border border-foreground/10 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
          <h2 className="font-display text-lg tracking-tight">Covenants</h2>
          <button onClick={() => setShowCov((v) => !v)} className="inline-flex items-center gap-2 h-8 px-3 text-sm rounded-md border border-foreground/15 hover:border-foreground/40"><Plus className="w-4 h-4" /> Add covenant</button>
        </div>
        {showCov && (
          <div className="px-5 py-4 border-b border-foreground/10 bg-foreground/[0.02]">
            <div className="grid sm:grid-cols-3 gap-3">
              <Field label="Name"><input value={cf.name} onChange={(e) => setCf({ ...cf, name: e.target.value })} className={input} placeholder="Min. DSCR 1.25x" /></Field>
              <Field label="Type"><select value={cf.kind} onChange={(e) => setCf({ ...cf, kind: e.target.value })} className={input}>{COV_KIND.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}</select></Field>
              <Field label="Requirement"><input value={cf.requirement} onChange={(e) => setCf({ ...cf, requirement: e.target.value })} className={input} placeholder="Tested quarterly" /></Field>
            </div>
            <div className="flex gap-3 mt-3">
              <button onClick={addCov} disabled={!cf.name.trim()} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"><Plus className="w-4 h-4" /> Add</button>
              <button onClick={() => setShowCov(false)} className="text-sm text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          </div>
        )}
        {covs.length === 0 ? (
          <EmptyState compact title="No covenants" description="Track financial and reporting covenants and their test status." />
        ) : (
          <div className="divide-y divide-foreground/[0.06]">
            {covs.map((c) => (
              <div key={c.id} className="px-5 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{c.name} <span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">· {c.kind}</span></div>
                  {c.requirement && <div className="text-[11px] text-muted-foreground">{c.requirement}{c.tested_at ? ` · tested ${fmtD(c.tested_at)}` : ""}</div>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <select value={c.status} onChange={(e) => setCov(c.id, e.target.value)} className={`h-8 px-1.5 text-[11px] border border-foreground/15 rounded bg-background font-medium ${COV_STATUS[c.status]}`}>
                    <option value="ok">OK</option><option value="at_risk">At risk</option><option value="breached">Breached</option><option value="waived">Waived</option>
                  </select>
                  <button onClick={() => delCov(c.id)} className="text-xs px-2 py-1 rounded border border-rose-500/30 text-rose-600 hover:bg-rose-500/5"><Trash2 className="w-3 h-3" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-background px-4 py-3.5">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-display tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
