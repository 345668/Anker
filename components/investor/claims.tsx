"use client"
import { useCallback, useEffect, useState } from "react"
import { call, field, btn, btnGhost } from "./api"

/** Records funds added that carry this person's address: link one to a profile entity. */
export function Claims({ entities }: { entities: Array<{ id: string; legalName: string }> }) {
  const [claims, setClaims] = useState<any[]>([]), [step, setStep] = useState<Record<string, "code" | undefined>>({}), [code, setCode] = useState<Record<string, string>>({}), [entity, setEntity] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null), [err, setErr] = useState<string | null>(null)
  const load = useCallback(() => call("/api/investor/claims").then((r) => setClaims(r.claims)).catch(() => setClaims([])), [])
  useEffect(() => { void load() }, [load])
  if (!claims.length) return null
  async function start(lpId: string) {
    setErr(null)
    try { const r = await call("/api/investor/claims", { method: "POST", body: { action: "start", lpId } }); setMsg(r.proved ? "Your address was already proved. Choose an entity and link it." : `We sent a six-digit code to ${r.sentTo}.`); setStep({ ...step, [lpId]: "code" }) } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") }
  }
  async function confirm(lpId: string) {
    setErr(null)
    try { await call("/api/investor/claims", { method: "POST", body: { action: "confirm", lpId, entityId: entity[lpId] ?? entities[0]?.id, code: code[lpId] } }); setMsg("Linked. You can follow it under My requests."); await load() } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") }
  }
  return <section className="space-y-3 rounded-lg border p-4"><h2 className="text-lg font-semibold">Funds that added you</h2>
    <p className="text-sm text-muted-foreground">These funds hold a record with your email address. Link one to your profile to follow it here.</p>
    {msg && <p role="status" className="text-sm">{msg}</p>}{err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    <ul className="space-y-3">{claims.map((c) => <li key={c.lpId} className="text-sm"><p className="font-medium">{c.fundName} <span className="font-normal text-muted-foreground">· held as “{c.name}”</span></p>
      {step[c.lpId] ? <div className="mt-2 flex flex-wrap items-end gap-2">
        <label>Entity<select className={field} value={entity[c.lpId] ?? entities[0]?.id} onChange={(e) => setEntity({ ...entity, [c.lpId]: e.target.value })}>{entities.map((e) => <option key={e.id} value={e.id}>{e.legalName}</option>)}</select></label>
        {!c.proved && <label>Code<input className={field} inputMode="numeric" autoComplete="one-time-code" value={code[c.lpId] ?? ""} onChange={(e) => setCode({ ...code, [c.lpId]: e.target.value })} /></label>}
        <button className={btn} onClick={() => confirm(c.lpId)}>Link it</button></div> :
        <button className={`${btnGhost} mt-2`} onClick={() => start(c.lpId)}>This is me: link it</button>}</li>)}</ul></section>
}
