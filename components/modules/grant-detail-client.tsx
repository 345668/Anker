"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Plus, Loader2, Trash2, TrendingUp } from "lucide-react"
import type { GrantServicing, GrantFull, Exercise } from "@/lib/modules/share-plans"

const ACCENT = "#e5380f"
const fmt = (n: number) => n.toLocaleString()
const money = (v: number) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtD = (s: string | null) => (s ? new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—")

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  granted: { label: "Granted", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  exercised: { label: "Exercised", cls: "bg-[#2f45e0]/10 text-[#2f45e0]" },
  cancelled: { label: "Cancelled", cls: "bg-foreground/[0.06] text-muted-foreground" },
}
const STATUS_OPTS: GrantFull["status"][] = ["draft", "granted", "exercised", "cancelled"]

export function GrantDetailClient({ initial }: { initial: GrantServicing }) {
  const [svc, setSvc] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [showEx, setShowEx] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [xf, setXf] = useState({ exercisedOn: "", quantity: "", note: "" })

  const g = svc.grant
  const st = STATUS[g.status] ?? STATUS.granted
  const input = "w-full h-9 px-3 text-sm border border-foreground/15 rounded-md bg-background outline-none focus:border-foreground/40"
  const pctVested = g.options > 0 ? Math.min(100, svc.vesting.fractionVested * 100) : 0
  const pctExercised = g.options > 0 ? Math.min(100, (g.exercised_options / g.options) * 100) : 0

  async function patch(body: Record<string, unknown>) {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/share-plans/${g.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? "Update failed"); return }
      if (d.servicing) setSvc(d.servicing)
      else if (d.grant) setSvc((s) => ({ ...s, grant: d.grant }))
    } catch { setErr("Network error") } finally { setBusy(false) }
  }

  async function addExercise() {
    const qty = Number(xf.quantity) || 0
    if (qty <= 0) return
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/share-plans/${g.id}/exercises`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ exercisedOn: xf.exercisedOn || null, quantity: qty, note: xf.note || null }) })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? "Could not record exercise"); return }
      if (d.servicing) setSvc(d.servicing)
      setXf({ exercisedOn: "", quantity: "", note: "" }); setShowEx(false)
    } catch { setErr("Network error") } finally { setBusy(false) }
  }

  async function removeExercise(eid: string) {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/share-plans/${g.id}/exercises/${eid}`, { method: "DELETE" })
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? "Delete failed"); return }
      if (d.servicing) setSvc(d.servicing)
    } catch { setErr("Network error") } finally { setBusy(false) }
  }

  return (
    <div className="px-6 lg:px-8 py-8 lg:py-10 max-w-6xl">
      <Link href="/dashboard/share-plans" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5">
        <ArrowLeft className="w-4 h-4" /> Share Plans
      </Link>

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-2 text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            <span className="w-2.5 h-2.5" style={{ background: ACCENT }} /> Equity Suite · option grant
          </div>
          <h1 className="text-3xl font-display tracking-tight">{g.grantee_name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {fmt(g.options)} options · strike {g.strike_price != null ? `$${g.strike_price}` : "—"} · {g.vest_months}mo vest, {g.cliff_months}mo cliff · granted {fmtD(g.grant_date)}
            {g.grantee_email ? ` · ${g.grantee_email}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-medium px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
          <select value={g.status} onChange={(e) => patch({ status: e.target.value })} disabled={busy} className="h-9 px-2 text-sm border border-foreground/15 rounded-md bg-background">
            {STATUS_OPTS.map((s) => <option key={s} value={s}>{STATUS[s].label}</option>)}
          </select>
        </div>
      </div>

      {err && <div className="mb-4 text-sm rounded-md border border-rose-500/30 bg-rose-500/[0.06] text-rose-600 dark:text-rose-400 px-3 py-2">{err}</div>}

      {/* Summary tiles */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-px bg-foreground/10 border border-foreground/10 rounded-md overflow-hidden mb-4">
        <Tile label="Granted" value={fmt(g.options)} />
        <Tile label="Vested" value={fmt(svc.vesting.vested)} sub={`${Math.round(svc.vesting.fractionVested * 100)}%`} />
        <Tile label="Unvested" value={fmt(svc.vesting.unvested)} />
        <Tile label="Exercised" value={fmt(g.exercised_options)} />
        <Tile label="Exercisable" value={fmt(svc.exercisable)} sub={svc.exercisableCost > 0 ? `${money(svc.exercisableCost)} to exercise` : undefined} tone="emerald" />
      </section>

      {/* Vesting progress */}
      <div className="mb-8 space-y-3">
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Vested</span><span>{fmt(svc.vesting.vested)} / {fmt(g.options)}{svc.vesting.cliffReached ? "" : " · pre-cliff"}</span></div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]"><div className="h-full" style={{ width: `${pctVested}%`, background: ACCENT }} /></div>
        </div>
        <div>
          <div className="flex justify-between text-xs text-muted-foreground mb-1"><span>Exercised</span><span>{fmt(g.exercised_options)} / {fmt(g.options)}</span></div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]"><div className="h-full bg-[#2f45e0]" style={{ width: `${pctExercised}%` }} /></div>
        </div>
        <p className="text-xs text-muted-foreground">
          {svc.vesting.cliffReached
            ? `Fully vested ${fmtD(svc.vesting.fullyVestedOn)}.`
            : `Cliff not yet reached — nothing vests until month ${g.cliff_months}.`}
          {g.terminated_on ? ` Vesting stopped on ${fmtD(g.terminated_on)} (termination).` : ""}
        </p>
      </div>

      {/* Terms */}
      <section className="mb-8 border border-foreground/10 rounded-xl p-5">
        <h2 className="font-display text-lg tracking-tight mb-4">Terms</h2>
        <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Field label="Options"><input defaultValue={g.options} onBlur={(e) => { const v = Number(e.target.value.replace(/[^0-9]/g, "")); if (v !== g.options) patch({ options: v }) }} className={input} /></Field>
          <Field label="Strike $"><input defaultValue={g.strike_price ?? ""} onBlur={(e) => { const v = e.target.value === "" ? null : Number(e.target.value); if (v !== g.strike_price) patch({ strike: v }) }} className={input} /></Field>
          <Field label="Grant date"><input type="date" defaultValue={g.grant_date ?? ""} onBlur={(e) => { if (e.target.value !== g.grant_date) patch({ grantDate: e.target.value }) }} className={input} /></Field>
          <Field label="Vesting start"><input type="date" defaultValue={g.vesting_start ?? ""} onBlur={(e) => { if (e.target.value !== g.vesting_start) patch({ vestingStart: e.target.value }) }} className={input} /></Field>
          <Field label="Vest (mo)"><input defaultValue={g.vest_months} onBlur={(e) => { const v = Number(e.target.value.replace(/[^0-9]/g, "")); if (v && v !== g.vest_months) patch({ vestMonths: v }) }} className={input} /></Field>
          <Field label="Cliff (mo)"><input defaultValue={g.cliff_months} onBlur={(e) => { const v = Number(e.target.value.replace(/[^0-9]/g, "")); if (v !== g.cliff_months) patch({ cliffMonths: v }) }} className={input} /></Field>
        </div>
        <div className="mt-3 grid sm:grid-cols-3 gap-3">
          <Field label="Termination date (freezes vesting)"><input type="date" defaultValue={g.terminated_on ?? ""} onBlur={(e) => { if (e.target.value !== (g.terminated_on ?? "")) patch({ terminatedOn: e.target.value || null }) }} className={input} /></Field>
        </div>
      </section>

      {/* Vesting schedule */}
      <section className="mb-8">
        <h2 className="font-display text-lg tracking-tight mb-3">Vesting schedule</h2>
        {svc.schedule.length === 0 ? (
          <div className="rounded-lg border border-foreground/10 p-5 text-sm text-muted-foreground">Set a vesting start and vest months to project the schedule.</div>
        ) : (
          <div className="overflow-x-auto border border-foreground/10 rounded-lg max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                  <th className="text-left px-4 py-2.5">Mo</th><th className="text-left px-4 py-2.5">Date</th>
                  <th className="text-right px-4 py-2.5">Vested this month</th><th className="text-right px-4 py-2.5">Cumulative vested</th>
                  <th className="text-right px-4 py-2.5">% of grant</th>
                </tr>
              </thead>
              <tbody>
                {svc.schedule.map((r) => (
                  <tr key={r.month} className={`border-b border-foreground/[0.06] last:border-0 ${r.isCliff ? "bg-[#e5380f]/[0.05]" : ""}`}>
                    <td className="px-4 py-2 text-muted-foreground">{r.month}{r.isCliff ? " ·" : ""}</td>
                    <td className="px-4 py-2">{fmtD(r.date)}{r.isCliff ? <span className="ml-2 text-[10px] font-mono uppercase tracking-wider text-[#e5380f]">cliff</span> : ""}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{r.vestedThisMonth > 0 ? `+${fmt(r.vestedThisMonth)}` : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums font-medium">{fmt(r.vested)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{g.options > 0 ? Math.round((r.vested / g.options) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Exercises */}
      <section className="mb-8 border border-foreground/10 rounded-md overflow-hidden">
        <div className="px-5 py-3 border-b border-foreground/10 flex items-center justify-between">
          <h2 className="font-display text-lg tracking-tight">Exercises</h2>
          <button onClick={() => setShowEx((v) => !v)} disabled={svc.exercisable <= 0} className="inline-flex items-center gap-2 h-8 px-3 text-sm rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-40"><Plus className="w-4 h-4" /> Record exercise</button>
        </div>
        {showEx && (
          <div className="px-5 py-4 border-b border-foreground/10 bg-foreground/[0.02]">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Field label="Date"><input type="date" value={xf.exercisedOn} onChange={(e) => setXf({ ...xf, exercisedOn: e.target.value })} className={input} /></Field>
              <Field label={`Quantity (max ${fmt(svc.exercisable)})`}><input value={xf.quantity} onChange={(e) => setXf({ ...xf, quantity: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" className={`${input} tabular-nums`} placeholder="0" /></Field>
              <Field label="Note"><input value={xf.note} onChange={(e) => setXf({ ...xf, note: e.target.value })} className={input} placeholder="optional" /></Field>
              <div className="flex items-end"><button onClick={addExercise} disabled={busy || !Number(xf.quantity)} className="inline-flex items-center gap-2 h-9 px-4 text-sm rounded-md bg-[#e5380f] text-white hover:bg-[#c72f0c] disabled:opacity-50">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <TrendingUp className="w-4 h-4" />} Record</button></div>
            </div>
          </div>
        )}
        {svc.exercises.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-muted-foreground">No exercises recorded yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-foreground/10 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                <th className="text-left px-5 py-2.5">Date</th><th className="text-right px-5 py-2.5">Quantity</th>
                <th className="text-right px-5 py-2.5">Cost at strike</th><th className="text-left px-5 py-2.5">Note</th><th className="px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {svc.exercises.map((x: Exercise) => (
                <tr key={x.id} className="border-b border-foreground/[0.06] last:border-0">
                  <td className="px-5 py-2.5">{fmtD(x.exercised_on)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums font-medium">{fmt(x.quantity)}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums text-muted-foreground">{g.strike_price != null ? money(x.quantity * g.strike_price) : "—"}</td>
                  <td className="px-5 py-2.5 text-muted-foreground">{x.note ?? "—"}</td>
                  <td className="px-5 py-2.5 text-right"><button onClick={() => removeExercise(x.id)} disabled={busy} className="text-muted-foreground hover:text-rose-600 disabled:opacity-40" aria-label="Remove exercise"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Cap table sync note */}
      <section className="mb-4 rounded-lg border border-foreground/10 bg-foreground/[0.02] p-4 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">Cap table:</span> this grant contributes {fmt(g.options)} options to your fully-diluted pool
        {g.exercised_options > 0 ? `, of which ${fmt(g.exercised_options)} have been exercised into shares` : ""}.
        {" "}Vested-to-date is {fmt(svc.vesting.vested)}. <Link href="/dashboard/cap-table" className="text-[#e5380f] hover:underline">View cap table →</Link>
      </section>
    </div>
  )
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "emerald" }) {
  return (
    <div className="bg-background p-3.5">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${tone === "emerald" ? "text-emerald-600 dark:text-emerald-400" : ""}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">{label}</span>{children}</label>
}
