"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface File { id: string; filename: string; sizeBytes: number; title?: string }
export interface SubscriptionView { status: "sent" | "returned" | "countersigned" | "rejected"; commitment: number; shareClass: string | null; subscriptionDate: string | null; rejectionReason: string | null; returnedAt: string | null; decidedAt: string | null; docs: File[]; signedCopy: File | null; countersignedCopy: File | null }
const MAX_BYTES = 4 * 1024 * 1024
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** The investor's subscription documents: read them, sign them outside the portal, confirm and send the signed PDF back (docs/architecture/60 section 7). */
export function LpSubscriptionCard({ token, view }: { token: string; view: SubscriptionView }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [agree, setAgree] = useState(false)
  const link = (f: File) => <a className="underline" href={`/api/portal/${token}/subscription/${f.id}`}>{f.title ?? f.filename}</a>
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setMsg(null)
    const form = new FormData(e.currentTarget)
    const file = form.get("file")
    if (file instanceof File && file.size > MAX_BYTES) { setMsg(`That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is 4 MB. Please send a smaller PDF (for example, scan in black and white or at a lower resolution).`); return }
    setBusy(true)
    const r = await fetch(`/api/portal/${token}/subscription`, { method: "POST", body: form }).catch(() => null)
    const j = await r?.json().catch(() => ({})) ?? {}
    setBusy(false)
    if (!r) { setMsg("Your connection dropped before the file was sent. Please try again."); return }
    if (!r.ok) { setMsg(r.status === 413 ? "That file is too large. The limit is 4 MB. Please send a smaller PDF." : j.error ?? "That did not work. Please try again."); return }
    router.refresh()
  }
  return (
    <section className="rounded-xl border p-5" aria-labelledby="sub-h">
      <h2 id="sub-h" className="text-lg font-semibold">Subscription documents</h2>
      <p className="mt-1 text-sm text-muted-foreground">Your commitment: <strong>{view.commitment.toLocaleString("en", { maximumFractionDigits: 0 })}</strong>{view.shareClass ? `, ${view.shareClass}` : ""}{view.subscriptionDate ? `, dated ${view.subscriptionDate}` : ""}.</p>

      {view.status === "countersigned" && (
        <div className="mt-3 text-sm"><p className="font-medium text-emerald-700">Complete. The fund countersigned your subscription{view.decidedAt ? ` on ${view.decidedAt}` : ""}.</p>
          <ul className="mt-2 space-y-1">{view.signedCopy && <li>Your signed copy: {link(view.signedCopy)}</li>}{view.countersignedCopy && <li>Countersigned by the fund: {link(view.countersignedCopy)}</li>}</ul></div>)}

      {view.status === "returned" && (
        <div className="mt-3 text-sm"><p>Thank you. You returned your signed copy{view.returnedAt ? ` on ${view.returnedAt}` : ""}. The fund is reviewing it.</p>
          {view.signedCopy && <p className="mt-1">Your copy: {link(view.signedCopy)}</p>}</div>)}

      {(view.status === "sent" || view.status === "rejected") && (
        <div className="mt-3 space-y-3 text-sm">
          {view.status === "rejected" && <p role="alert" className="rounded-md border border-amber-500 p-3">The fund sent your documents back: {view.rejectionReason}. Please correct this and send them again.</p>}
          <div><p className="font-medium">1. Read these documents</p><ul className="mt-1 space-y-1">{view.docs.map((d) => <li key={d.id}>{link(d)} <span className="text-xs text-muted-foreground">({kb(d.sizeBytes)})</span></li>)}</ul></div>
          <p><span className="font-medium">2. Sign them</span> in the way the fund asks (print and sign, or use the fund&apos;s signing service), and make one PDF of the signed pages.</p>
          <form onSubmit={submit} className="space-y-3">
            <p className="font-medium">3. Confirm and send the signed PDF</p>
            <label className="block">Signed PDF (up to 4 MB)<input type="file" name="file" accept="application/pdf,.pdf" required className="mt-1 block w-full text-sm" /></label>
            <label className="block">Type your full name to confirm<input name="ackName" required minLength={3} autoComplete="name" className="mt-1 h-9 w-full max-w-sm rounded-md border bg-transparent px-3 text-sm" /></label>
            <label className="flex items-start gap-2"><input type="checkbox" name="agree" value="true" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} /><span>I have read the documents listed above and I am returning them signed.</span></label>
            <button className="h-9 rounded-md border px-4 disabled:opacity-50" disabled={busy || !agree}>Send my signed documents</button>
          </form>
          <p className="text-xs text-muted-foreground">This records that you returned a signed document and exactly which documents you confirmed. It is not a legally validated electronic signature; the fund may ask you to sign through its own signing service as well.</p>
        </div>)}
      {msg && <p role="alert" className="mt-3 text-sm text-red-600">{msg}</p>}
    </section>
  )
}
