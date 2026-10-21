"use client"
import { useState } from "react"
import { call, field, btnGhost } from "./api"
import { TEXTS } from "@/lib/investor/legal"

/** The investor's rights: a copy of their data, and erasure. */
export function YourData() {
  const [phrase, setPhrase] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null), [done, setDone] = useState<any>(null)
  async function erase() {
    setBusy(true); setErr(null)
    try { const r = await call("/api/investor/erase", { method: "POST", body: { confirm: phrase } }); setDone(r.summary) } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") } finally { setBusy(false) }
  }
  if (done) return <section className="space-y-2 rounded-lg border p-4 text-sm"><h2 className="text-lg font-semibold">Your investor account has been erased</h2>
    <p>{done.entitiesAnonymised} entities anonymised, {done.passportFilesRemoved} passport files removed, {done.requestsWithdrawn} open requests withdrawn.</p>
    <p className="text-muted-foreground">Funds keep: {done.whatFundsKeep.join("; ")}.</p>
    <a className={btnGhost} href="/">Leave</a></section>
  return <section className="space-y-4 rounded-lg border p-4 text-sm"><h2 className="text-lg font-semibold">Your data</h2>
    <div className="space-y-2"><p className="text-muted-foreground">{TEXTS.exportStatement.text}</p><a className={btnGhost} href="/api/investor/export">Download my data</a></div>
    <div className="space-y-2"><p className="text-muted-foreground">{TEXTS.eraseStatement.text}</p>
      <label className="block max-w-xs">Type {TEXTS.eraseConfirmPhrase.text} to confirm<input className={field} value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" /></label>
      {err && <p role="alert" className="text-red-600">{err}</p>}
      <button className={btnGhost} disabled={busy || phrase !== TEXTS.eraseConfirmPhrase.text} onClick={erase}>{busy ? "Erasing…" : "Delete my investor account"}</button></div></section>
}
