"use client"

import { useCallback, useEffect, useState } from "react"

interface Row { id: string; name: string; type: string | null; state: string; email: string | null; contactName: string | null; invitedAt: string | null; openedAt: string | null; waitingDays: number | null; differs: boolean; detailsToReview: boolean; submitted: { legalName: string; entityType: string; country: string | null; taxResidence: string | null; taxIdLast4: string | null } | null }
const LABEL: Record<string, string> = { not_invited: "Not invited", invited: "Invited", opened: "Opened the portal", details_confirmed: "Details confirmed", terms_accepted: "Terms accepted", verification_submitted: "Verification sent", subscription_returned: "Subscription returned", countersigned: "Countersigned" }

/** The fund's view of its LPs' onboarding: who has an email, who has been invited, who is stuck (docs/architecture/60). */
export function LpOnboardingPanel({ fundId }: { fundId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => { const r = await fetch(`/api/portfolio/funds/${fundId}/lp-onboarding`, { cache: "no-store" }); if (r.ok) setRows((await r.json()).lps); else setErr("The onboarding list could not be loaded.") }, [fundId])
  useEffect(() => { void load() }, [load])
  if (err) return <p className="px-4 py-3 text-xs text-red-600" role="alert">{err}</p>
  if (!rows || rows.length === 0) return null

  async function saveContact(lp: Row, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(lp.id); setMsg(null)
    const f = new FormData(e.currentTarget)
    const r = await fetch(`/api/portfolio/lps/${lp.id}/contact`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: f.get("email"), name: f.get("name") }) })
    setMsg(r.ok ? `Saved the address for ${lp.name}.` : (await r.json().catch(() => ({}))).error ?? "Could not save.")
    setBusy(null); await load()
  }
  async function invite(lp: Row) {
    if (!confirm(`Email ${lp.name} a personal link to their portal? It goes to ${lp.email} and is valid 30 days. A link sent before stops working.`)) return
    setBusy(lp.id); setMsg(null)
    const r = await fetch(`/api/portfolio/lps/${lp.id}/invite`, { method: "POST" })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? `Invitation sent to ${j.sentTo}.` : j.error ?? "Could not send.")
    setBusy(null); await load()
  }
  async function reviewed(lp: Row) { setBusy(lp.id); await fetch(`/api/portfolio/lps/${lp.id}/review`, { method: "POST" }); setBusy(null); await load() }

  const missing = rows.filter((r) => !r.email).length
  const small = "h-8 rounded-md border px-3 text-xs disabled:opacity-50"
  return (
    <div className="border-b border-foreground/10 px-4 py-4 text-sm" aria-labelledby="lp-ob-h">
      <h3 id="lp-ob-h" className="font-medium">LP portal and onboarding</h3>
      <p className="mt-1 text-xs text-muted-foreground">Each investor gets a personal link and, to open it, a six-digit code sent to their own address. They then confirm their details and accept the terms. Add an email address first.{missing > 0 ? ` ${missing} of ${rows.length} still need one.` : ""}</p>
      {msg && <p role="status" className="mt-2 text-xs">{msg}</p>}
      <ul className="mt-3 divide-y divide-foreground/10">
        {rows.map((lp) => (
          <li key={lp.id} className="py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span><strong>{lp.name}</strong> <span className="text-xs text-muted-foreground">· {LABEL[lp.state] ?? lp.state}{lp.waitingDays != null && lp.waitingDays >= 10 ? ` · waiting ${lp.waitingDays} days` : ""}</span></span>
              {lp.email && <button className={small} disabled={busy === lp.id} onClick={() => invite(lp)}>{lp.state === "not_invited" ? "Invite to portal" : "Send a new link"}</button>}
            </div>
            {!lp.email ? (
              <form onSubmit={(e) => saveContact(lp, e)} className="mt-2 flex flex-wrap items-center gap-2">
                <input name="email" type="email" required placeholder="email address" aria-label={`Email for ${lp.name}`} className="h-8 w-56 rounded-md border bg-transparent px-2 text-xs" />
                <input name="name" placeholder="contact name (optional)" aria-label={`Contact name for ${lp.name}`} className="h-8 w-44 rounded-md border bg-transparent px-2 text-xs" />
                <button className={small} disabled={busy === lp.id}>Save address</button>
              </form>
            ) : <p className="mt-1 text-xs text-muted-foreground">{lp.contactName ? `${lp.contactName}, ` : ""}{lp.email}</p>}
            {lp.submitted && (
              <p className="mt-1 text-xs">Submitted by the LP: <strong>{lp.submitted.legalName}</strong> ({lp.submitted.entityType.replace("_", " ")}){lp.submitted.country ? `, ${lp.submitted.country}` : ""}{lp.submitted.taxIdLast4 ? `, tax number ending ${lp.submitted.taxIdLast4}` : ""}.
                {lp.differs && <span className="text-amber-700"> The name differs from your record.</span>}
                {lp.detailsToReview && <> <button className="underline" disabled={busy === lp.id} onClick={() => reviewed(lp)}>Mark as read</button></>}</p>)}
          </li>))}
      </ul>
    </div>
  )
}
