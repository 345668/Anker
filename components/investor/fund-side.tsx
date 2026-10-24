"use client"
import { useCallback, useEffect, useState } from "react"
import { TEXTS } from "@/lib/investor/legal"
import { call, field, btn, btnGhost, money } from "./api"
import { Thread } from "./thread"
import { TalkExtras } from "./talk-extras"

const CATS = [["professional", "Professional"], ["semi_professional", "Semi-professional"], ["other", "Other"], ["unsure", "Unsure"]]
function Listing() {
  const [s, setS] = useState<any>(null), [r, setR] = useState<any>(null), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false), [ok, setOk] = useState<string | null>(null)
  useEffect(() => { call("/api/fund/investor-listing").then((x) => { setS(x.listing); setR({ categories: x.listing.rules?.categories ?? [], countries: (x.listing.rules?.countries ?? []).join(", "), excludedCountries: (x.listing.rules?.excludedCountries ?? []).join(", "), minTicket: x.listing.rules?.minTicket ?? "", professionalOnly: !!x.listing.rules?.professionalOnly, dailyCap: x.listing.rules?.dailyCap ?? 10, ndaRequired: !!x.listing.rules?.ndaRequired, strict: !!x.listing.rules?.strict, ndaText: x.listing.rules?.ndaText ?? "" }) }).catch((e) => setErr(e.message)) }, [])
  async function save(listed?: boolean) {
    setBusy(true); setErr(null); setOk(null)
    try { const x = await call("/api/fund/investor-listing", { method: "PUT", body: { rules: { ...r, minTicket: r.minTicket === "" ? null : r.minTicket }, ...(listed === undefined ? {} : { listed }) } }); setS(x.listing); setOk(listed === undefined ? "Saved, and what investors see is refreshed." : listed ? "Your fund is now shown to investors." : "Your fund is no longer shown to investors.") } catch (e) { setErr(e instanceof Error ? e.message : "Try again.") } finally { setBusy(false) }
  }
  if (!s || !r) return err ? <p role="alert">{err}</p> : <p role="status">Loading…</p>
  const toggle = (c: string) => setR({ ...r, categories: r.categories.includes(c) ? r.categories.filter((x: string) => x !== c) : [...r.categories, c] })
  return <section className="space-y-4"><h2 className="text-lg font-semibold">Show this fund to investors</h2>
    <p className="max-w-3xl text-sm text-muted-foreground">{TEXTS.listingManagerNotice.text} {s.listed ? <strong>It is on.</strong> : <strong>It is off.</strong>}</p>
    <div className="grid max-w-3xl gap-3 sm:grid-cols-2">
      <fieldset className="text-sm sm:col-span-2"><legend className="font-medium">Investor categories you accept (none ticked = any)</legend>{CATS.map(([v, l]) => <label key={v} className="mr-4 inline-flex items-center gap-1.5"><input type="checkbox" checked={r.categories.includes(v)} onChange={() => toggle(v)} />{l}</label>)}</fieldset>
      <label className="text-sm">Only these countries (two-letter codes)<input className={field} value={r.countries} onChange={(e) => setR({ ...r, countries: e.target.value })} placeholder="DE, FR, GB" /></label>
      <label className="text-sm">Never these countries<input className={field} value={r.excludedCountries} onChange={(e) => setR({ ...r, excludedCountries: e.target.value })} placeholder="US" /></label>
      <label className="text-sm">Minimum cheque<input className={field} inputMode="numeric" value={r.minTicket} onChange={(e) => setR({ ...r, minTicket: e.target.value })} /></label>
      <label className="text-sm">New requests a day (1 to 100)<input className={field} inputMode="numeric" value={r.dailyCap} onChange={(e) => setR({ ...r, dailyCap: e.target.value })} /></label>
      <label className="inline-flex items-center gap-1.5 text-sm sm:col-span-2"><input type="checkbox" checked={r.strict} onChange={(e) => setR({ ...r, strict: e.target.checked })} />{TEXTS.listingStrictLabel.text}</label>
      <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={r.professionalOnly} onChange={(e) => setR({ ...r, professionalOnly: e.target.checked })} />Professional investors only</label>
      <label className="inline-flex items-center gap-1.5 text-sm"><input type="checkbox" checked={r.ndaRequired} onChange={(e) => setR({ ...r, ndaRequired: e.target.checked })} />An NDA is needed before documents are opened</label>
      {r.ndaRequired && <label className="text-sm sm:col-span-2">{TEXTS.ndaFundLabel.text}<textarea className={field} rows={6} maxLength={20000} value={r.ndaText} onChange={(e) => setR({ ...r, ndaText: e.target.value })} /></label>}
    </div>
    {(s.warnings ?? []).map((w: string) => <p key={w} role="note" className="max-w-3xl rounded-md border border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">{w}</p>)}
    {s.snapshot && <p className="text-sm text-muted-foreground">Investors read: “{s.snapshot.whoMayInvest}” · version {s.version}</p>}
    {err && <p role="alert" className="text-sm text-red-600">{err}</p>}{ok && <p role="status" className="text-sm">{ok}</p>}
    <div className="flex gap-2"><button className={btnGhost} disabled={busy} onClick={() => save()}>Save and refresh</button>
      {s.listed ? <button className={btnGhost} disabled={busy} onClick={() => save(false)}>Stop showing</button> : <button className={btn} disabled={busy} onClick={() => save(true)}>Show to investors</button>}</div></section>
}

function Queue() {
  const [note, setNote] = useState<string | null>(null), [open, setOpen] = useState<string | null>(null), [d, setD] = useState<any>(null), [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => call("/api/fund/investor-requests").then(setD).catch((e) => setErr(e.message)), [])
  useEffect(() => { void load() }, [load])
  async function invite(id: string) {
    if (!window.confirm("Invite this investor to onboard? This creates their record in your fund and emails them a personal link.")) return
    try { const r = await call(`/api/fund/investor-requests/${id}/invite`, { method: "POST" }); setNote(r.emailSent ? `Invited. The link was sent to ${r.sentTo}.` : `The record was made but the email was not sent (${r.emailError}). Use “Send a new link” in your LP list.`); await load() } catch (e) { setErr(e instanceof Error ? e.message : "Try again.") }
  }
  async function decide(id: string, decision: "accept" | "decline") { try { await call(`/api/fund/investor-requests/${id}`, { method: "POST", body: { decision } }); await load() } catch (e) { setErr(e instanceof Error ? e.message : "Try again.") } }
  if (!d) return err ? <p role="alert">{err}</p> : <p role="status">Loading…</p>
  return <section className="space-y-3"><h2 className="text-lg font-semibold">Requests from investors</h2>{err && <p role="alert" className="text-sm text-red-600">{err}</p>}{note && <p role="status" className="text-sm">{note}</p>}
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
          <div className="shrink-0 text-right">{q.stage === "interested" ? <div className="flex gap-2"><button className={btn} onClick={() => decide(q.id, "accept")}>Accept</button><button className={btnGhost} onClick={() => decide(q.id, "decline")}>Decline</button></div> : <div className="space-y-1"><p className="text-muted-foreground">{q.stage.replace(/_/g, " ")}{q.onboardingState ? ` · ${q.onboardingState.replace(/_/g, " ")}` : ""}</p>{q.stage === "in_talks" && <button className={btn} onClick={() => invite(q.id)}>Invite to onboard</button>}{q.stage !== "declined" && q.stage !== "withdrawn" && <button className={btnGhost} onClick={() => setOpen(open === q.id ? null : q.id)}>{open === q.id ? "Hide messages" : "Messages"}</button>}</div>}</div></div>
        {open === q.id && <><Thread base={`/api/fund/investor-requests/${q.id}`} me="fund" /><TalkExtras base={`/api/fund/investor-requests/${q.id}`} me="fund" /></>}
      </li>)}</ul>}</section>
}
function Discovery() {
  const [d, setD] = useState<any>(null), [err, setErr] = useState<string | null>(null), [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(() => call("/api/fund/investor-discovery").then(setD).catch((e) => setErr(e.message)), [])
  useEffect(() => { void load() }, [load])
  if (!d || !d.open) return err ? <p role="alert" className="text-sm text-red-600">{err}</p> : null
  const invite = (cardId: string) => call("/api/fund/investor-discovery", { method: "POST", body: { cardId } }).then(() => { setMsg("Invitation sent."); return load() }).catch((e) => setErr(e.message))
  return <section className="space-y-3"><h2 className="text-lg font-semibold">Find investors</h2>
    <p className="max-w-3xl text-sm text-muted-foreground">{TEXTS.discoverabilityFund.text}</p>
    {err && <p role="alert" className="text-sm text-red-600">{err}</p>}{msg && <p role="status" className="text-sm">{msg}</p>}
    {d.cards.length === 0 ? <p className="text-sm">{d.poolTooSmall ? TEXTS.discoveryPoolNotice.text : "No investor who fits is open to being found yet."}</p> : <ul className="space-y-2">{d.cards.map((c: any) => <li key={c.cardId} className="flex items-start justify-between gap-4 rounded-lg border p-3 text-sm">
      <div><p className="font-medium">{c.kind.replace("_", " ")}{c.country ? ` · ${c.country}` : ""}{c.category ? ` · ${c.category.replace("_", " ")} (${c.categoryNote})` : ""}</p>
        <p className="text-muted-foreground">Cheque {c.interests.ticketMin ?? "?"} to {c.interests.ticketMax ?? "?"} · {c.interests.sectors.join(", ") || "no sectors stated"} · {c.interests.stages.join(", ") || "no stages stated"} · {c.interests.geographies.join(", ") || "no regions stated"}</p>
        <p>{c.sentence}</p></div>
      {c.invited ? <span className="shrink-0 text-muted-foreground">Invited</span> : <button className={btn} onClick={() => invite(c.cardId)}>Invite to connect</button>}</li>)}</ul>}
    {d.invites.length > 0 && <div className="text-sm"><p className="font-medium">Your invitations</p><ul className="space-y-1">{d.invites.map((i: any) => <li key={i.id} className="flex items-center justify-between gap-2"><span>{i.card.kind.replace("_", " ")}{i.card.country ? ` · ${i.card.country}` : ""} <span className="text-muted-foreground">· {i.status}</span></span>
      {i.status === "sent" && <button className={btnGhost} onClick={() => call(`/api/fund/investor-discovery?inviteId=${i.id}`, { method: "DELETE" }).then(load).catch((e) => setErr(e.message))}>Withdraw</button>}</li>)}</ul></div>}</section>
}
export function InvestorSide() {
  const [ready, setReady] = useState<"loading" | "ok" | "nofund">("loading")
  useEffect(() => { call("/api/fund/investor-listing").then(() => setReady("ok")).catch((e) => setReady(/does not manage a fund/i.test(String(e?.message)) ? "nofund" : "ok")) }, [])
  if (ready === "nofund") return <div className="max-w-xl space-y-3"><h1 className="text-xl font-semibold">Investors</h1><p className="text-sm">This workspace does not have a fund yet, so there is nothing to show to investors.</p><p className="text-sm text-muted-foreground">Set up the fund first (name, strategy, size and who it is for), then come back here to choose who may see it.</p><a className={btn} href="/dashboard/portfolio/fund">Set up your fund</a></div>
  if (ready === "loading") return <p role="status" className="text-sm">Loading…</p>
  return <div className="space-y-10"><div><h1 className="text-xl font-semibold">Investors</h1><p className="mt-1 text-sm text-muted-foreground">Let investors find this fund and ask to talk. You decide who sees it, and you answer each request.</p></div><Queue /><Discovery /><Listing /></div> }
