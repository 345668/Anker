"use client"
import { useState } from "react"
import Link from "next/link"
import { call, field, btn } from "./api"

export function StartProfile({ name }: { name: string }) {
  const [n, setN] = useState(name), [terms, setTerms] = useState(false), [busy, setBusy] = useState(false), [err, setErr] = useState<string | null>(null)
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await call("/api/investor/profile/start", { method: "POST", body: { name: n, termsAccepted: terms } }); window.location.assign("/investor") } catch (x) { setErr(x instanceof Error ? x.message : "Try again."); setBusy(false) }
  }
  return <form onSubmit={go} className="max-w-md space-y-4"><h1 className="text-xl font-semibold">Create your investor profile</h1>
    <p className="text-sm text-muted-foreground">With a profile you can find funds, ask to talk, and see every fund you invest in in one place.</p>
    <label className="block text-sm">Your name<input className={field} value={n} onChange={(e) => setN(e.target.value)} required /></label>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={terms} onChange={(e) => setTerms(e.target.checked)} /><span>I accept the <Link className="underline" href="/terms">terms</Link> and have read the <Link className="underline" href="/privacy">privacy notice</Link>.</span></label>
    {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
    <button className={btn} disabled={busy || !terms}>{busy ? "Working…" : "Create my profile"}</button></form>
}
