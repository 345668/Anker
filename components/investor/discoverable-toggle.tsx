"use client"
import { useEffect, useState } from "react"
import { call, btn, btnGhost } from "./api"

/** The owner's switch: let funds that fit see a limited card. Hidden while the platform has not opened it. */
export function DiscoverableToggle({ entityId }: { entityId: string }) {
  const [s, setS] = useState<{ discoverable: boolean; open: boolean } | null>(null), [err, setErr] = useState<string | null>(null)
  useEffect(() => { call(`/api/investor/entities/${entityId}/discoverable`).then(setS).catch(() => setS(null)) }, [entityId])
  if (!s || (!s.open && !s.discoverable)) return null
  const set = (on: boolean) => call(`/api/investor/entities/${entityId}/discoverable`, { method: "PUT", body: { on } }).then((r) => setS({ ...s, discoverable: r.discoverable })).catch((e) => setErr(e.message))
  return <section className="space-y-2 rounded-lg border p-4 text-sm"><h2 className="text-lg font-semibold">Let funds find you</h2>
    <p className="text-muted-foreground">If you switch this on, funds whose rules you meet can see a card: the kind of entity, country, your declared category, your cheque range and what you look for. Never your name, email or team. A fund can only invite you to connect; nothing else is shared unless you accept. Switch it off any time.</p>
    {err && <p role="alert" className="text-red-600">{err}</p>}
    {s.discoverable ? <div className="flex items-center gap-3"><span>It is <strong>on</strong>.</span><button className={btnGhost} onClick={() => set(false)}>Switch off</button></div> : <button className={btn} onClick={() => set(true)}>Switch on</button>}</section>
}
