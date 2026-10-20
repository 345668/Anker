"use client"
import { useCallback, useEffect, useState } from "react"
import { call, btn, btnGhost } from "./api"

/** Invitations to join someone's investor entity, addressed to this confirmed email. */
export function Invitations({ onJoined }: { onJoined?: () => void }) {
  const [list, setList] = useState<any[]>([]), [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => call("/api/investor/invitations").then((r) => setList(r.invitations)).catch(() => setList([])), [])
  useEffect(() => { void load() }, [load])
  if (!list.length) return null
  const answer = (id: string, action: string) => call("/api/investor/invitations", { method: "POST", body: { action, id } }).then(() => { void load(); if (action === "accept") onJoined?.() }).catch((e) => setErr(e.message))
  return <section className="space-y-3 rounded-lg border p-4"><h2 className="text-lg font-semibold">Invitations</h2>{err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    <ul className="space-y-2 text-sm">{list.map((i) => <li key={i.id} className="flex items-center justify-between gap-2"><span>{i.from} invited you to <strong>{i.entityName}</strong> as: {i.role === "can_act" ? "can act" : "can view"}</span>
      <span className="flex gap-1"><button className={btn} onClick={() => answer(i.id, "accept")}>Accept</button><button className={btnGhost} onClick={() => answer(i.id, "decline")}>Decline</button></span></li>)}</ul></section>
}
