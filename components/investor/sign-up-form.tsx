"use client"
import { useState } from "react"
import { LegalText } from "./legal-text"
import { TEXTS } from "@/lib/investor/legal"
import Link from "next/link"
import { call, field, btn } from "./api"

export function InvestorSignUpForm() {
  const [step, setStep] = useState<"start" | "verify" | "done">("start")
  const [v, setV] = useState({ email: "", name: "", code: "", password: "" })
  const [terms, setTerms] = useState(false)
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [note, setNote] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value })
  async function go(e: React.FormEvent) {
    e.preventDefault(); if (busy) return
    setBusy(true); setError(null)
    try {
      if (step === "start") { const r = await call("/api/investor/signup", { method: "POST", body: { step: "start", email: v.email, name: v.name, termsAccepted: terms } }); setNote(`We sent a six-digit code to ${r.sentTo}. It works for ${r.expiresInMinutes} minutes.`); setStep("verify") }
      else { await call("/api/investor/signup", { method: "POST", body: { step: "verify", email: v.email, code: v.code, password: v.password } }); setStep("done") }
    } catch (err) { setError(err instanceof Error ? err.message : "Try again.") } finally { setBusy(false) }
  }
  if (step === "done") return <div className="space-y-3"><p role="status">Your account is ready.</p><Link className={btn} href="/auth/login?redirect=/investor">Sign in</Link></div>
  return <form onSubmit={go} className="space-y-4" aria-busy={busy}>
    {step === "start" ? <>
      <label className="block text-sm">Your name<input className={field} value={v.name} onChange={set("name")} autoComplete="name" required /></label>
      <label className="block text-sm">Email address<input className={field} type="email" value={v.email} onChange={set("email")} autoComplete="email" required /></label>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" /><span><LegalText text={TEXTS.signupConsent.text} /></span></label>
    </> : <>
      {note && <p role="status" className="text-sm">{note}</p>}
      <label className="block text-sm">Six-digit code<input className={field} inputMode="numeric" autoComplete="one-time-code" value={v.code} onChange={set("code")} required /></label>
      <label className="block text-sm">Choose a password (at least 10 characters)<input className={field} type="password" autoComplete="new-password" value={v.password} onChange={set("password")} required /></label>
    </>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <button className={btn} disabled={busy || (step === "start" && !terms)}>{busy ? "Working…" : step === "start" ? "Send me a code" : "Create my account"}</button>
  </form>
}
