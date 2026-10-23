"use client"
import { useState } from "react"
import { call, btn } from "./api"
import { LegalText } from "./legal-text"
import { TEXTS } from "@/lib/investor/legal"

export function AcceptTerms() {
  const [ok, setOk] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  async function go() { setBusy(true); setErr(null); try { await call("/api/investor/accept-terms", { method: "POST", body: { accept: true } }); window.location.assign("/investor") } catch (x) { setErr(x instanceof Error ? x.message : "Try again."); setBusy(false) } }
  return <div className="mt-6 space-y-4"><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={ok} onChange={(e) => setOk(e.target.checked)} /><span><LegalText text={TEXTS.signupConsent.text} /></span></label>
    {err && <p role="alert" className="text-sm text-red-600">{err}</p>}<button className={btn} disabled={!ok || busy} onClick={go}>{busy ? "Working…" : "Continue"}</button></div>
}
