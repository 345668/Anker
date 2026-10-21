"use client"
import { useCallback, useEffect, useState } from "react"
import { TEXTS } from "@/lib/investor/legal"
import { call, field, btn, btnGhost } from "./api"

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "")

function Materials({ base, me }: { base: string; me: "investor" | "fund" }) {
  const [d, setD] = useState<any>(null), [err, setErr] = useState<string | null>(null), [pick, setPick] = useState("")
  const load = useCallback(() => call(`${base}/materials`).then((r) => { setD(r); setErr(null) }).catch((e) => setErr(e.message)), [base])
  useEffect(() => { void load() }, [load])
  const act = (body: unknown) => call(`${base}/${me === "investor" ? "nda" : "materials"}`, { method: "POST", body }).then(load).catch((e) => setErr(e.message))
  if (!d) return err ? <p role="alert" className="text-sm text-red-600">{err}</p> : null
  if (me === "investor") return <div className="space-y-2"><h3 className="font-medium">Documents from the fund</h3>
    {d.nda.required && !d.nda.accepted && d.open && <div className="space-y-2 rounded-md border p-3"><p>{TEXTS.ndaInvestorNotice.text}</p>
      <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-background p-2 text-xs">{d.nda.text}</pre><button className={btn} onClick={() => call(`${base}/nda`, { method: "POST" }).then(load).catch((e) => setErr(e.message))}>I accept this NDA</button></div>}
    {d.nda.accepted && <p className="text-xs text-muted-foreground">You accepted the fund’s NDA on {fmt(d.nda.acceptedAt)}.</p>}
    {d.items.length === 0 ? <p className="text-muted-foreground">{d.nda.required && !d.nda.accepted ? "Nothing to show until you accept the NDA." : "The fund has not shared any documents yet."}</p> :
      <ul className="space-y-1">{d.items.map((i: any) => <li key={i.grantId}><a className="underline" href={`${base}/materials/${i.documentId}`} target="_blank" rel="noreferrer">{i.title}</a> <span className="text-muted-foreground">· {i.category.replace(/_/g, " ")}{i.bytes ? ` · ${Math.round(i.bytes / 1024)} KB` : ""}</span></li>)}</ul>}
    <p className="text-xs text-muted-foreground">{TEXTS.materialsNote.text}</p>
    {err && <p role="alert" className="text-red-600">{err}</p>}</div>
  return <div className="space-y-2"><h3 className="font-medium">Share documents</h3>
    {d.ndaRequired && !d.ndaAccepted && <p className="text-muted-foreground">NDA not yet accepted: the investor cannot open documents yet.</p>}
    {d.open && d.available.length > 0 && <div className="flex gap-2"><select className={field} value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Choose a document</option>{d.available.map((a: any) => <option key={a.id} value={a.id}>{a.title} ({a.category.replace(/_/g, " ")})</option>)}</select>
      <button className={btnGhost} disabled={!pick} onClick={() => { void act({ action: "grant", documentId: pick }); setPick("") }}>Share</button></div>}
    {d.open && d.available.length === 0 && d.granted.length === 0 && <p className="text-muted-foreground">No fund-wide documents in your library to share.</p>}
    <ul className="space-y-1">{d.granted.map((g: any) => <li key={g.grantId} className="flex items-center justify-between"><span>{g.title} <span className="text-muted-foreground">· {g.opened ? "opened" : "not opened yet"}</span></span><button className={btnGhost} onClick={() => act({ action: "revoke", grantId: g.grantId })}>Withdraw</button></li>)}</ul>
    {err && <p role="alert" className="text-red-600">{err}</p>}</div>
}

function Meetings({ base }: { base: string }) {
  const [list, setList] = useState<any[] | null>(null), [f, setF] = useState({ startsAt: "", link: "", note: "" }), [err, setErr] = useState<string | null>(null), [open, setOpen] = useState(false)
  const load = useCallback(() => call(`${base}/meetings`).then((r) => setList(r.meetings)).catch((e) => setErr(e.message)), [base])
  useEffect(() => { void load() }, [load])
  async function propose(e: React.FormEvent) {
    e.preventDefault(); setErr(null)
    try { await call(`${base}/meetings`, { method: "POST", body: { startsAt: f.startsAt ? new Date(f.startsAt).toISOString() : null, link: f.link || null, note: f.note || null } }); setF({ startsAt: "", link: "", note: "" }); setOpen(false); await load() } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") }
  }
  const answer = (id: string, action: string) => call(`${base}/meetings/${id}`, { method: "POST", body: { action } }).then(load).catch((e) => setErr(e.message))
  if (!list) return null
  return <div className="space-y-2"><div className="flex items-center justify-between"><h3 className="font-medium">Meetings</h3>{!open && <button className={btnGhost} onClick={() => setOpen(true)}>Propose a meeting</button>}</div>
    {open && <form onSubmit={propose} className="space-y-2 rounded-md border p-3">
      <label className="block">Time<input className={field} type="datetime-local" value={f.startsAt} onChange={(e) => setF({ ...f, startsAt: e.target.value })} /></label>
      <label className="block">Meeting link (https://…)<input className={field} value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} /></label>
      <label className="block">Note<input className={field} maxLength={500} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      <div className="flex gap-2"><button className={btn}>Send proposal</button><button type="button" className={btnGhost} onClick={() => setOpen(false)}>Cancel</button></div></form>}
    {list.length === 0 ? <p className="text-muted-foreground">No meetings proposed.</p> : <ul className="space-y-1">{list.map((m) => <li key={m.id} className="flex items-start justify-between gap-2">
      <span>{m.mine ? "You proposed" : "Proposed to you"}: {m.startsAt ? fmt(m.startsAt) : "no time set"}{m.link ? <> · <a className="underline" href={m.link} target="_blank" rel="noreferrer">link</a></> : null}{m.note ? ` · “${m.note}”` : ""} <span className="text-muted-foreground">· {m.status}</span></span>
      {m.status === "proposed" && (m.mine ? <button className={btnGhost} onClick={() => answer(m.id, "cancel")}>Cancel</button> : <span className="flex gap-1"><button className={btn} onClick={() => answer(m.id, "accept")}>Accept</button><button className={btnGhost} onClick={() => answer(m.id, "decline")}>Decline</button></span>)}</li>)}</ul>}
    {err && <p role="alert" className="text-red-600">{err}</p>}</div>
}

export function TalkExtras({ base, me }: { base: string; me: "investor" | "fund" }) {
  return <div className="mt-3 space-y-4 rounded-md border bg-muted/20 p-3 text-sm"><Materials base={base} me={me} /><Meetings base={base} /></div>
}
