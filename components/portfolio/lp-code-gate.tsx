"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

/** The screen an investor sees before anything about them: the fund's name and a masked address. A six-digit code is emailed to that address (docs/architecture/60). */
export function LpCodeGate({ token, fundName, maskedEmail }: { token: string; fundName: string | null; maskedEmail: string | null }) {
  const router = useRouter()
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function post(body: Record<string, unknown>) {
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/portal/${token}/code`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setMsg(j.error ?? "Something went wrong. Please try again."); return null }
    return j
  }
  const send = async () => { const j = await post({ action: "send" }); if (j) setSent(true) }
  const verify = async (e: React.FormEvent) => { e.preventDefault(); const j = await post({ action: "verify", code }); if (j) router.refresh() }
  const btn = "h-10 rounded-md border px-5 text-sm disabled:opacity-50"
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        <h1 className="font-display text-2xl">{fundName ?? "Investor portal"}</h1>
        {!maskedEmail ? <p className="text-sm text-muted-foreground">This portal has no email address to send a code to. Please contact the fund team.</p> : !sent ? (
          <>
            <p className="text-sm text-muted-foreground">To keep your information private, we will send a six-digit code to <strong>{maskedEmail}</strong>.</p>
            <button className={btn} disabled={busy} onClick={send}>Email me a code</button>
          </>
        ) : (
          <form onSubmit={verify} className="space-y-3">
            <p className="text-sm text-muted-foreground">We sent a code to <strong>{maskedEmail}</strong>. It is valid for 10 minutes.</p>
            <label className="block text-left text-sm"><span className="font-medium">Code</span>
              <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} className="mt-1 h-11 w-full rounded-md border bg-transparent px-3 text-center text-xl tracking-[0.4em]" aria-label="Six-digit code" />
            </label>
            <button className={btn} disabled={busy || code.replace(/\s/g, "").length !== 6}>Open my portal</button>
            <div><button type="button" className="text-xs underline" disabled={busy} onClick={send}>Send a new code</button></div>
          </form>
        )}
        {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
        <p className="text-xs text-muted-foreground">This page is private to you. Do not forward the email with your link.</p>
      </div>
    </main>
  )
}
