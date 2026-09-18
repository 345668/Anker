"use client"
import { useState, useTransition } from "react"
import { runFromConsole } from "./actions"
import type { WaitlistAction } from "@/lib/marketing/waitlist-admin"

const button = "min-h-11 border border-foreground/30 px-3 text-sm underline-offset-4 hover:underline disabled:opacity-50"

/**
 * Lifecycle controls for one request.
 *
 * Which actions exist depends on the state, so an owner cannot, say, invite a
 * declined applicant or revoke an account that already exists. Accepted rows
 * carry no controls at all: removing that access is a separate, deliberate act
 * on the account, not a waitlist edit.
 */
export function RowActions(
  { id, status, ttl }: { id: string; status: string; ttl: { default: number; min: number; max: number } },
) {
  const [pending, start] = useTransition()
  const [message, setMessage] = useState("")
  const [failed, setFailed] = useState(false)
  const [days, setDays] = useState(String(ttl.default))

  const run = (action: WaitlistAction, confirmText?: string) => () => {
    if (confirmText && !window.confirm(confirmText)) return
    start(async () => {
      const result = await runFromConsole(action, id, Number(days))
      setFailed(!result.ok)
      setMessage(result.message)
    })
  }

  if (status === "accepted") return <span className="text-sm text-muted-foreground">Account created</span>

  const canInvite = status === "approved" || status === "revoked" || status === "invited"
  return <div className="space-y-2">
    {canInvite && <label className="block text-xs text-muted-foreground">
      Link expires in
      <input type="number" inputMode="numeric" min={ttl.min} max={ttl.max} value={days}
        onChange={e => setDays(e.target.value)} disabled={pending}
        className="ml-2 min-h-11 w-20 border border-foreground/30 bg-background px-2 text-sm text-foreground" /> days
    </label>}
    <div className="flex flex-wrap gap-2">
      {status === "pending" && <>
        <button type="button" disabled={pending} className={button} onClick={run("approve")}>Approve</button>
        <button type="button" disabled={pending} className={button} onClick={run("decline")}>Decline</button>
      </>}
      {(status === "approved" || status === "revoked") &&
        <button type="button" disabled={pending} className={button} onClick={run("invite")}>Send invitation</button>}
      {status === "invited" && <>
        <button type="button" disabled={pending} className={button}
          onClick={run("invite", "Resending replaces the current link. The one already sent will stop working. Continue?")}>Resend</button>
        <button type="button" disabled={pending} className={button}
          onClick={run("revoke", "Revoke this invitation? The link stops working immediately.")}>Revoke</button>
      </>}
      {status === "declined" &&
        <button type="button" disabled={pending} className={button} onClick={run("approve")}>Reopen</button>}
    </div>
    {pending && <p role="status" className="text-sm text-muted-foreground">Working…</p>}
    {message && !pending && <p role={failed ? "alert" : "status"} className={failed ? "border-l-2 border-red-600 pl-3 text-sm" : "text-sm text-muted-foreground"}>{message}</p>}
  </div>
}
