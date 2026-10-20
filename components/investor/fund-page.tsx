"use client"
import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { call, field, btn, money } from "./api"

const TIMINGS = [["", "No preference"], ["now", "Now"], ["this_quarter", "This quarter"], ["this_year", "This year"], ["exploring", "Just exploring"]]
export function FundPage({ fundId }: { fundId: string }) {
  const qs = useSearchParams(), [entityId, setEntityId] = useState(qs.get("entityId") ?? "")
  const [entities, setEntities] = useState<any[]>([]), [d, setD] = useState<any>(null), [err, setErr] = useState<string | null>(null), [sent, setSent] = useState(false)
  const [f, setF] = useState<any>({ indicativeMin: "", indicativeMax: "", timing: "", note: "", name: true, country: true, category: true, interests: true }), [busy, setBusy] = useState(false), [formErr, setFormErr] = useState<string | null>(null)
  useEffect(() => { call("/api/investor/entities").then((r) => { setEntities(r.entities); if (!entityId) setEntityId(r.entities[0]?.id ?? "") }).catch((e) => setErr(e.message)) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { call(`/api/investor/funds/${fundId}${entityId ? `?entityId=${entityId}` : ""}`).then(setD).catch((e) => setErr(e.message)) }, [fundId, entityId])
  if (err) return <p role="alert">{err} <Link className="underline" href="/investor/funds">Back to funds</Link></p>
  if (!d) return <p role="status">Loading…</p>
  const s = d.fund.snapshot, fit = d.fit
  async function send(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setFormErr(null)
    try { await call("/api/investor/requests", { method: "POST", body: { entityId, fundId, indicativeMin: f.indicativeMin || null, indicativeMax: f.indicativeMax || null, timing: f.timing || null, note: f.note || null, share: { name: f.name, country: f.country, category: f.category, interests: f.interests } } }); setSent(true) } catch (x) { setFormErr(x instanceof Error ? x.message : "Try again.") } finally { setBusy(false) }
  }
  return <div className="space-y-8">
    <Link className="text-sm underline" href="/investor/funds">← All funds</Link>
    <div><h1 className="text-xl font-semibold">{s.name}</h1><p className="text-sm text-muted-foreground">{s.manager}{s.status ? ` · ${s.status}` : ""}{s.vintageYear ? ` · vintage ${s.vintageYear}` : ""}</p></div>
    {s.description && <p className="max-w-3xl text-sm">{s.description}</p>}
    <dl className="grid max-w-3xl gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {[["Strategy", s.strategy], ["Sectors", s.sectors.join(", ")], ["Stages", s.stages.join(", ")], ["Geography", s.geographies.join(", ")], ["Target size", s.targetSize == null ? null : money(s.targetSize, s.currency ?? "")], ["Minimum commitment", s.minCommitment == null ? null : money(s.minCommitment, s.currency ?? "")], ["Term", s.termYears ? `${s.termYears} years` : null], ["Who may invest", s.whoMayInvest]]
        .map(([k, v]) => <div key={k as string}><dt className="text-muted-foreground">{k}</dt><dd>{v || "Not stated"}</dd></div>)}
    </dl>
    <section className="max-w-3xl rounded-lg border p-4 text-sm"><label className="block max-w-sm">How it fits<select className={field} value={entityId} onChange={(e) => setEntityId(e.target.value)}>{entities.map((e) => <option key={e.id} value={e.id}>{e.legalName}</option>)}</select></label>
      {fit && <div className="mt-3 space-y-1"><p>{fit.sentence}</p>
        {fit.fit.reasons.map((r: string) => <p key={r} className="text-muted-foreground">+ {r}</p>)}
        {fit.eligibility.failed.map((r: string) => <p key={r} className="text-red-700">✕ {r}</p>)}
        {fit.fit.gaps.length > 0 && <p className="text-xs text-muted-foreground">Not judged: {fit.fit.gaps.join("; ")}</p>}</div>}</section>
    <section className="max-w-3xl"><h2 className="text-lg font-semibold">Ask to talk</h2>
      <p className="mt-1 text-sm text-muted-foreground">This is an expression of interest. It is not an offer, a subscription or an obligation. The fund sees what you choose to share below, and your email address only if it accepts.</p>
      {sent ? <p role="status" className="mt-4 text-sm">Sent. You can follow it under <Link className="underline" href="/investor/requests">My requests</Link>.</p> :
        <form onSubmit={send} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">Indicative amount, from<input className={field} inputMode="numeric" value={f.indicativeMin} onChange={(e) => setF({ ...f, indicativeMin: e.target.value })} /></label>
            <label className="text-sm">to<input className={field} inputMode="numeric" value={f.indicativeMax} onChange={(e) => setF({ ...f, indicativeMax: e.target.value })} /></label>
            <label className="text-sm">Timing<select className={field} value={f.timing} onChange={(e) => setF({ ...f, timing: e.target.value })}>{TIMINGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          </div>
          <label className="block text-sm">A note to the fund (optional)<textarea className={field} rows={3} maxLength={1000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <fieldset className="text-sm"><legend className="font-medium">Share with the fund</legend>
            {[["name", "My name"], ["country", "My country"], ["category", "My declared investor category"], ["interests", "What I look for"]].map(([k, l]) => <label key={k} className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} />{l}</label>)}</fieldset>
          {formErr && <p role="alert" className="text-sm text-red-600">{formErr}</p>}
          <button className={btn} disabled={busy || !entityId}>{busy ? "Sending…" : "Send request"}</button>
        </form>}</section>
  </div>
}
