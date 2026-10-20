"use client"
import { useCallback, useEffect, useState } from "react"
import { call, field, btn, btnGhost, money } from "./api"

const CATS = [["professional", "Professional"], ["semi_professional", "Semi-professional"], ["other", "Other"], ["unsure", "Unsure"]]
function Listing() {
  const [s, setS] = useState<any>(null), [r, setR] = useState<any>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [ok, setOk] = useState<string | null>(null)
  useEffect(() => { call("/api/fund/investor-listing").then((x) => { setS(x.listing); setR({ categories: x.listing.rules?.categories ?? [], countries: (x.listing.rules?.countries ?? []).join(", "), excludedCountries: (x.listing.rules?.excludedCountries ?? []).join(", "), minTicket: x.listing.rules?.minTicket ?? "", professionalOnly: !!x.listing.rules?.professionalOnly, dailyCap: x.listing.rules?.dailyCap ?? 10, ndaRequired: !!x.listing.rules?.ndaRequired }) }).catch((e) => setErr(e.message)) }, [])
  async function save(listed?: boolean) {
    setBusy(true); setErr(null); setOk(null)
    try { const x = await call("/api/fund/investor-listing", { method: "PUT", body: { rules: { ...r, minTicket: r.minTicket === "" ? null : r.minTicket }, ...(listed === undefined ? {} : { listed }) } }); setS(x.listing); setOk(listed === undefined ? "Saved, and what investors see is refreshed." : listed ? "Your fund is now shown to investors." : "Your fund is no longer shown to investors.") } catch (e) { setErr(e instanceof Error ? e.message : "Try again.") } finally { setBusy(false) }
  }
  if (!s || !r) return err ? <p role="alert">{err}</p> : <p role="status">Loading…</p>
  const toggle = (c: string) => setR({ ...r, categories: r.categories.includes(c) ? r.categories.filter((x: string) => x !== c) : [...r.categories, c] })
  return <section className="space-y-4"><h2 className="text-lg font-semibold">Show this fund to investors</h2>
    <p className="max-w-3xl text-sm text-muted-foreground">Investors see a fixed summary taken from your fund and your profile: never documents, your LP list, performance or your CRM. Nothing is shown until you set who may invest and switch it on. {s.listed ? <strong>It is on.</strong> : <strong>It is off.</strong>}</p>
    <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
      <fieldset className="text-sm sm:col-span-2"><legend className="font-medium">Investor categories you accept (none ticked = any)</legend>{CATS.map(([v, l]) => <label key={v} className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" checked={r.categories.includes(v)} onChange={() => toggle(v)} />{l}</label>)}</fieldset>
      <label className="text-sm">Only these countries (two-letter codes)<input className={field} value={r.countries} onChange={(e) => setR({ ...r, countries: e.target.value })} placeholder="DE, FR, GB" /></label>
      <label className="text-sm">Never these countries<input className={field} value={r.excludedCountries} onChange={(e) => setR({ ...r, excludedCountries: e.target.value })} placeholder="US" /></label>
      <label className="text-sm">Minimum cheque<input className={field} inputMode="numeric" value={r.minTicket} onChange={(e) => setR({ ...r, minTicket: e.target.value })} /></label>
      <label className="text-sm">New requests a day (1 to 100)<input className={field} inputMode="numeric" value={r.dailyCap} onChange={(e) => setR({ ...r, dailyCap: e.target.value })} /></label>
      <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={r.professionalOnly} onChange={(e) => setR({ ...r, professionalOnly: e.target.checked })} />Professional investors only</label>
      <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={r.ndaRequired} onChange={(e) => setR({ ...r, ndaRequired: e.target.checked })} />An NDA is needed before details</label>
    </div>
    {s.snapshot && <p className="text-sm text-muted-foreground">Investors read: “{s.snapshot.whoMayInvest}” · version {s.version}</p>}
    {err && <p role="alert" className="text-sm text-red-600">{err}</p>}{ok && <p role="status" className="text-sm">{ok}</p>}
    <div className="flex gap-2"><button className={btnGhost} disabled={busy} onClick={() => save()}>Save and refresh</button>
      {s.listed ? <button className={btnGhost} disabled={busy} onClick={() => save(false)}>Stop showing</button> : <button className={btn} disabled={busy} onClick={() => save(true)}>Show to investors</button>}</div></section>
}

function Queue() {
  const [d, setD] = useState<any>(null), [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => call("/api/fund/investor-requests").then(setD).catch((e) => setErr(e.message)), [])
  useEffect(() => { void load() }, [load])
  async function decide(id: string, decision: "accept" | "decline") { try { await call(`/api/fund/investor-requests/${id}`, { method: "POST", body: { decision } }); await load() } catch (e) { setErr(e instanceof Error ? e.message : "Try again.") } }
  if (!d) return err ? <p role="alert">{err}</p> : <p role="status">Loading…</p>
  return <section className="space-y-3"><h2 className="text-lg font-semibold">Requests from investors</h2>{err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    {d.requests.length === 0 ? <p className="text-sm">No investor has asked to talk yet.</p> :
      <ul className="space-y-3">{d.requests.map((q: any) => <li key={q.id} className="rounded-lg border p-4 text-sm">
        <div className="flex items-start justify-between gap-4"><div>
          <p className="font-medium">{q.shared.name ?? "An investor (name not shared)"} <span className="font-normal text-muted-foreground">· {q.shared.kind ?? ""}{q.shared.country ? ` · ${q.shared.country}` : ""}</span></p>
          {q.shared.category && <p className="text-muted-foreground">Declares {String(q.shared.category).replace("_", " ")} ({q.shared.categoryNote})</p>}
          <p>Indicative: {q.indicative.min == null && q.indicative.max == null ? "not stated" : `${money(q.indicative.min)} to ${money(q.indicative.max)}`}{q.timing ? ` · ${q.timing.replace("_", " ")}` : ""}</p>
          {q.eligibility && <p className={q.eligibility.status === "ineligible" ? "text-red-700" : "text-muted-foreground"}>Against your rules: {q.eligibility.status}{q.eligibility.failed.length ? ` (${q.eligibility.failed.join("; ")})` : ""}</p>}
          {q.fit && <p className="text-muted-foreground">Fit with your stated focus: {q.fit.score ?? "not judged"} ({q.fit.confidence} confidence)</p>}
          {q.note && <p className="mt-1">“{q.note}”</p>}
          {q.contactEmail && <p className="mt-1">Contact: <a className="underline" href={`mailto:${q.contactEmail}`}>{q.contactEmail}</a></p>}</div>
          <div className="shrink-0 text-right">{q.stage === "interested" ? <div className="flex gap-2"><button className={btn} onClick={() => decide(q.id, "accept")}>Accept</button><button className={btnGhost} onClick={() => decide(q.id, "decline")}>Decline</button></div> : <p className="text-muted-foreground">{q.stage.replace("_", " ")}</p>}</div></div>
      </li>)}</ul>}</section>
}
export function InvestorSide() { return <div className="space-y-10"><div><h1 className="text-xl font-semibold">Investors</h1><p className="mt-1 text-sm text-muted-foreground">Let investors find this fund and ask to talk. You decide who sees it, and you answer each request.</p></div><Queue /><Listing /></div> }
