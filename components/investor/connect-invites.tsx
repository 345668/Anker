"use client"
import { useCallback, useEffect, useState } from "react"
import { TEXTS } from "@/lib/investor/legal"
import { call, btn, btnGhost } from "./api"

/** Funds that invited one of this person's entities to connect. Nothing is shared unless they accept. */
export function ConnectInvites() {
  const [list, setList] = useState<any[]>([]), [err, setErr] = useState<string | null>(null), [msg, setMsg] = useState<string | null>(null), [share, setShare] = useState({ name: true, country: true, category: true, interests: true })
  const load = useCallback(() => call("/api/investor/invites").then((r) => setList(r.invites)).catch(() => setList([])), [])
  useEffect(() => { void load() }, [load])
  if (!list.length && !msg) return null
  const answer = (id: string, action: string) => call("/api/investor/invites", { method: "POST", body: { id, action, share } }).then(() => { setMsg(action === "accept" ? "Accepted. The conversation is open under My requests." : "Declined. The fund is only told it was not taken forward."); void load() }).catch((e) => setErr(e.message))
  return <section className="space-y-3 rounded-lg border p-4"><h2 className="text-lg font-semibold">Funds that would like to connect</h2>
    {msg && <p role="status" className="text-sm">{msg}</p>}{err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    <ul className="space-y-3 text-sm">{list.map((i) => <li key={i.id}><p><strong>{i.fundName}</strong> invited <strong>{i.entityName}</strong>.</p>{i.summary && <p className="text-muted-foreground">{i.summary}</p>}{i.whoMayInvest && <p className="text-muted-foreground">{i.whoMayInvest}</p>}
      <p className="mt-1 text-xs text-muted-foreground">{TEXTS.inviteAcceptNote.text}</p>
      <div className="flex flex-wrap gap-3 text-xs">{([["name", "My name"], ["country", "My country"], ["category", "My declared category"], ["interests", "What I look for"]] as const).map(([k, l]) => <label key={k} className="inline-flex items-center gap-1"><input type="checkbox" checked={(share as any)[k]} onChange={(e) => setShare({ ...share, [k]: e.target.checked })} />{l}</label>)}</div>
      <div className="mt-2 flex gap-2"><button className={btn} onClick={() => answer(i.id, "accept")}>Accept</button><button className={btnGhost} onClick={() => answer(i.id, "decline")}>Decline</button></div></li>)}</ul></section>
}
