"use client"

import { useCallback, useEffect, useState } from "react"

interface Row { id: string; name: string; type: string | null; state: string; email: string | null; contactName: string | null; invitedAt: string | null; openedAt: string | null; waitingDays: number | null; differs: boolean; detailsToReview: boolean; submitted: { legalName: string; entityType: string; country: string | null; taxResidence: string | null; taxIdLast4: string | null } | null; subscription: Sub | null; verification: Ver | null }
interface Ver { caseId: string | null; caseStatus: string | null; submittedAt: string | null; category: string | null; ownersProvided: boolean; docs: Array<{ docId: string; type: string; label: string; status: string; fileId: string | null; filename: string | null; sizeBytes: number | null; sha256: string | null; receivedAt: string | null; note: string | null }> }
interface Sub { status: string; commitment: number; shareClass: string | null; sentAt: string; returnedAt: string | null; ackName: string | null; rejectionReason: string | null; signedCopy: { id: string; filename: string; sizeBytes: number; sha256: string; scanned: boolean } | null }
const READY = new Set(["terms_accepted", "verification_submitted", "subscription_returned", "countersigned"])
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
  async function subscription(lp: Row, e: React.FormEvent<HTMLFormElement>, action: "send" | "reject" | "accept") {
    e.preventDefault(); setBusy(lp.id); setMsg(null)
    const f = new FormData(e.currentTarget)
    let r: Response
    if (action === "accept") { f.set("action", "accept"); r = await fetch(`/api/portfolio/lps/${lp.id}/subscription`, { method: "POST", body: f }) }
    else r = await fetch(`/api/portfolio/lps/${lp.id}/subscription`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, shareClass: f.get("shareClass"), date: f.get("date"), reason: f.get("reason") }) })
    setMsg(r.ok ? (action === "send" ? `Subscription documents sent to ${lp.name}.` : action === "accept" ? `${lp.name} is countersigned.` : "Sent back with your reason.") : (await r.json().catch(() => ({}))).error ?? "That did not work.")
    setBusy(null); await load()
  }
  async function verification(lp: Row, action: "verify" | "reject", docType: string) {
    let note: string | null = null
    if (action === "reject") { note = prompt("What is wrong with this document? The investor will see this."); if (!note) return }
    setBusy(lp.id); setMsg(null)
    const r = await fetch(`/api/portfolio/lps/${lp.id}/verification`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, docType, note }) })
    setMsg(r.ok ? (action === "verify" ? "Marked as checked." : "Sent back to the investor.") : (await r.json().catch(() => ({}))).error ?? "That did not work.")
    setBusy(null); await load()
  }
  async function owners(lp: Row) { const r = await fetch(`/api/portfolio/lps/${lp.id}/verification`, { cache: "no-store" }); const j = await r.json().catch(() => ({})); alert(j.owners ? `Who owns and controls ${lp.name}, as the investor stated it:\n\n${j.owners}` : "Nothing was provided.") }
  async function tell(lp: Row, kind: "reminder" | "new_material") {
    if (!confirm(kind === "reminder" ? `Email ${lp.name} a reminder with a new link? Their earlier link stops working.` : `Email ${lp.name} that something new is in their portal, with a new link? Their earlier link stops working. The email names no document and no amount.`)) return
    setBusy(lp.id); setMsg(null)
    const r = await fetch(`/api/portfolio/lps/${lp.id}/invite`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ kind }) })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? `Email sent to ${j.sentTo}.` : j.error ?? "Could not send.")
    setBusy(null); await load()
  }
  async function activity(lp: Row) {
    const r = await fetch(`/api/portfolio/lps/${lp.id}/activity`, { cache: "no-store" }); const j = await r.json().catch(() => null)
    if (!j) return
    alert(j.recent.length ? `${lp.name}: last seen ${j.lastSeen?.slice(0, 16).replace("T", " ")}.\n\n` + j.recent.map((a: { at: string; what: string }) => `${a.at.slice(0, 16).replace("T", " ")}  ${a.what}`).join("\n") : `${lp.name} has not opened the portal yet.`)
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
              {lp.email && (
                <span className="flex flex-wrap gap-1.5">
                  <button className={small} disabled={busy === lp.id} onClick={() => invite(lp)}>{lp.state === "not_invited" ? "Invite to portal" : "Send a new link"}</button>
                  {lp.state !== "not_invited" && lp.state !== "countersigned" && <button className={small} disabled={busy === lp.id} onClick={() => tell(lp, "reminder")}>Remind</button>}
                  {lp.state !== "not_invited" && <button className={small} disabled={busy === lp.id} onClick={() => tell(lp, "new_material")}>Tell them there is something new</button>}
                  {lp.state !== "not_invited" && <button className={small} onClick={() => activity(lp)}>Activity</button>}
                  <a className={`${small} inline-flex items-center`} href={`/api/portfolio/lps/${lp.id}/statement-pdf`}>Statement PDF</a>
                </span>)}
            </div>
            {!lp.email ? (
              <form onSubmit={(e) => saveContact(lp, e)} className="mt-2 flex flex-wrap items-center gap-2">
                <input name="email" type="email" required placeholder="email address" aria-label={`Email for ${lp.name}`} className="h-8 w-56 rounded-md border bg-transparent px-2 text-xs" />
                <input name="name" placeholder="contact name (optional)" aria-label={`Contact name for ${lp.name}`} className="h-8 w-44 rounded-md border bg-transparent px-2 text-xs" />
                <button className={small} disabled={busy === lp.id}>Save address</button>
              </form>
            ) : <p className="mt-1 text-xs text-muted-foreground">{lp.contactName ? `${lp.contactName}, ` : ""}{lp.email}</p>}
            {(READY.has(lp.state) || lp.subscription) && (
              <div className="mt-2 rounded-md border border-foreground/10 p-2 text-xs">
                <span className="font-medium">Subscription:</span>{" "}
                {!lp.subscription || lp.subscription.status === "rejected" ? (
                  <form onSubmit={(e) => subscription(lp, e, "send")} className="mt-1 flex flex-wrap items-center gap-2">
                    {lp.subscription?.status === "rejected" && <span className="text-amber-700">Sent back: {lp.subscription.rejectionReason}.</span>}
                    <input name="shareClass" placeholder="class (optional)" aria-label="Share class" className="h-8 w-32 rounded-md border bg-transparent px-2" />
                    <input name="date" type="date" aria-label="Subscription date" className="h-8 rounded-md border bg-transparent px-2" />
                    <button className={small} disabled={busy === lp.id}>{lp.subscription ? "Send again" : "Send subscription documents"}</button>
                  </form>
                ) : lp.subscription.status === "sent" ? <span>Sent {lp.subscription.sentAt}, waiting for the signed copy.</span>
                  : lp.subscription.status === "countersigned" ? <span>Countersigned. Commitment {lp.subscription.commitment.toLocaleString("en", { maximumFractionDigits: 0 })}.</span> : (
                  <div className="mt-1 space-y-2">
                    <p>Returned {lp.subscription.returnedAt}, confirmed by {lp.subscription.ackName}. {lp.subscription.signedCopy && <><a className="underline" href={`/api/portfolio/subscription-files/${lp.subscription.signedCopy.id}`}>Download the signed copy</a> ({Math.round(lp.subscription.signedCopy.sizeBytes / 1024)} KB, not virus-scanned{lp.subscription.signedCopy.scanned ? ", scanned" : ""}; fingerprint {lp.subscription.signedCopy.sha256.slice(0, 12)}).</>}</p>
                    <form onSubmit={(e) => subscription(lp, e, "accept")} className="flex flex-wrap items-center gap-2">
                      <input type="file" name="file" accept="application/pdf,.pdf" aria-label="Your countersigned PDF (optional)" className="text-xs" />
                      <button className={small} disabled={busy === lp.id}>Countersign and accept</button>
                    </form>
                    <form onSubmit={(e) => subscription(lp, e, "reject")} className="flex flex-wrap items-center gap-2">
                      <input name="reason" required minLength={5} placeholder="what needs fixing" aria-label="Reason" className="h-8 w-64 rounded-md border bg-transparent px-2" />
                      <button className={small} disabled={busy === lp.id}>Send back</button>
                    </form>
                  </div>)}
              </div>)}
            {lp.verification && (
              <div className="mt-2 rounded-md border border-foreground/10 p-2 text-xs">
                <span className="font-medium">Verification:</span> {lp.verification.submittedAt ? `sent ${lp.verification.submittedAt}` : "in progress"}{lp.verification.category ? `, says: ${lp.verification.category.replace("_", "-")} investor` : ""}{lp.verification.caseStatus ? ` · case ${lp.verification.caseStatus.replace("_", " ")}` : ""}. {lp.verification.ownersProvided && <button className="underline" onClick={() => owners(lp)}>Show who owns the entity</button>}
                <ul className="mt-1 space-y-1">
                  {lp.verification.docs.map((d) => (
                    <li key={d.docId} className="flex flex-wrap items-center gap-2">
                      <span>{d.label}: <strong>{d.status}</strong></span>
                      {d.fileId && <a className="underline" href={`/api/portfolio/kyc-files/${d.fileId}`}>Open ({Math.round((d.sizeBytes ?? 0) / 1024)} KB, fingerprint {d.sha256?.slice(0, 10)})</a>}
                      {d.status === "received" && <><button className={small} disabled={busy === lp.id} onClick={() => verification(lp, "verify", d.type)}>Mark checked</button><button className={small} disabled={busy === lp.id} onClick={() => verification(lp, "reject", d.type)}>Send back</button></>}
                      {d.status === "rejected" && d.note && <span className="text-amber-700">sent back: {d.note}</span>}
                    </li>))}
                </ul>
                {lp.verification.caseId && <a className="mt-1 inline-block underline" href={`/dashboard/kyc-aml/${lp.verification.caseId}`}>Open the compliance case (screening and decision)</a>}
              </div>)}
            {lp.submitted && (
              <p className="mt-1 text-xs">Submitted by the LP: <strong>{lp.submitted.legalName}</strong> ({lp.submitted.entityType.replace("_", " ")}){lp.submitted.country ? `, ${lp.submitted.country}` : ""}{lp.submitted.taxIdLast4 ? `, tax number ending ${lp.submitted.taxIdLast4}` : ""}.
                {lp.differs && <span className="text-amber-700"> The name differs from your record.</span>}
                {lp.detailsToReview && <> <button className="underline" disabled={busy === lp.id} onClick={() => reviewed(lp)}>Mark as read</button></>}</p>)}
          </li>))}
      </ul>
    </div>
  )
}
