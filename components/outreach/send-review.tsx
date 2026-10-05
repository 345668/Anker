"use client"

import { useCallback, useEffect, useState } from "react"
import { VERDICT_TEXT, type VerdictCode } from "@/lib/outreach/send-auth/verdicts"

interface PItem { messageId: string; name: string; to: string; cc: string[]; bcc: string[]; subject: string; body: string; country: string | null; verdict: { code: VerdictCode; detail?: string }; droppedSecondary: Array<{ email: string; field: string; reason: string }> }
interface Preview { error: string | null; provider: string; accountEmail: string | null; items: PItem[]; sendableCount: number; blockedCount: number; countries: Record<string, number>; cap: { daily: number; sentToday: number; remaining: number; days: number }; digest: string; requiresTypedCount: boolean; count: number }

/**
 * Review and send (docs/architecture/46 §4): what will be sent, to whom, from which mailbox, what is refused and why, how long a big batch takes. Approving is the
 * person's decision about exactly this set; nothing is sent by looking. Sent mail cannot be recalled, and the dialog says so.
 */
export function SendReview({ messageIds, provider, onClose, onDone }: { messageIds: string[]; provider?: "resend" | "gmail"; onClose: () => void; onDone?: (r: any) => void }) {
  const [p, setP] = useState<Preview | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [typed, setTyped] = useState("")
  const [after, setAfter] = useState("")
  const [note, setNote] = useState<string | null>(null)
  const [result, setResult] = useState<any>(null)
  const load = useCallback(async () => {
    setErr(null)
    const r = await fetch("/api/outreach/send-authorizations/preview", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageIds, provider, sendAfter: after ? new Date(after).toISOString() : undefined }) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(j.error ?? "Could not load the preview."); return }
    setP(j)
  }, [messageIds, provider, after])
  useEffect(() => { void load() }, [load])

  async function approve() {
    if (!p) return
    setBusy(true); setErr(null)
    const r = await fetch("/api/outreach/send-authorizations", { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ messageIds, provider, digest: p.digest, typedCount: p.requiresTypedCount ? Number(typed) : undefined, sendAfter: after ? new Date(after).toISOString() : undefined }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false)
    if (!r.ok) { setErr(j.error ?? "Could not approve."); if (/changed since/.test(j.error ?? "")) void load(); return }
    setResult(j); onDone?.(j)
  }
  async function test() {
    setBusy(true); setNote(null)
    const r = await fetch("/api/outreach/send-authorizations/test", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messageId: messageIds[0] }) })
    const j = await r.json().catch(() => ({}))
    setBusy(false); setNote(r.ok ? `A test copy was sent to ${j.sentTo}. Nothing went to the recipient.` : j.error ?? "Could not send a test.")
  }

  const first = p?.items.find((i) => i.verdict.code === "ok") ?? p?.items[0]
  const blocked = p?.items.filter((i) => i.verdict.code !== "ok") ?? []
  const dropped = p?.items.flatMap((i) => i.droppedSecondary.map((d) => ({ ...d, member: i.name }))) ?? []
  return (
    <div role="dialog" aria-modal="true" aria-label="Review and send" className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-8 w-full max-w-2xl rounded-xl border border-foreground/10 bg-background p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">Review and send</h2>
          <button onClick={onClose} className="rounded-md border border-foreground/15 px-2 py-0.5 text-sm">Close</button>
        </div>
        {err && <p role="alert" className="mt-3 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">{err}</p>}
        {result ? (
          <div className="mt-4 space-y-2 text-sm" role="status">
            <p className="font-medium">Approved. {result.authorized} message{result.authorized === 1 ? "" : "s"}{result.sendNow ? `: ${result.sendNow.sent} sent now` : ""}.</p>
            {result.sendNow?.paused && <p className="text-amber-700 dark:text-amber-300">Sending is paused for the whole platform right now, so nothing has gone. Your approval stands for 7 days and the messages will go out when sending resumes, or you can stop them below.</p>}
            {result.sendNow && !result.sendNow.paused && result.sendNow.sent < result.authorized && <p className="text-muted-foreground">The rest will go out as your daily cap allows{result.days > 1 ? ` (about ${result.days} days in all)` : ""}. You can stop what has not gone from Sending, below.</p>}
            {result.blocked > 0 && <p className="text-muted-foreground">{result.blocked} {result.blocked === 1 ? "was" : "were"} left out; the reasons are on the authorization.</p>}
            <button onClick={onClose} className="mt-2 rounded-md bg-foreground px-3 py-1.5 text-background">Done</button>
          </div>
        ) : !p ? <p className="mt-4 text-sm text-muted-foreground">Checking recipients…</p> : p.error ? null : (
          <div className="mt-4 space-y-4 text-sm">
            <div className="rounded-lg bg-foreground/5 p-3">
              <p><span className="font-medium">{p.count}</span> ready to send from <span className="font-medium">{p.provider === "gmail" ? (p.accountEmail ?? "your Gmail") : "Resend (Anker's sending address)"}</span>
                {Object.keys(p.countries).length > 0 && <> to {Object.entries(p.countries).map(([c, n]) => `${n} in ${c === "unknown" ? "unknown country" : c}`).join(", ")}</>}.</p>
              <p className="mt-1 text-muted-foreground">Today you have {p.cap.remaining} of {p.cap.daily} sends left{p.cap.days > 1 ? `, so this will take about ${p.cap.days} days` : ""}. Each message carries an unsubscribe link.</p>
            </div>
            {blocked.length > 0 && (
              <div>
                <p className="font-medium text-amber-700 dark:text-amber-300">{blocked.length} will not be sent</p>
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">{blocked.slice(0, 8).map((i) => <li key={i.messageId}>{i.name || i.to}: {i.verdict.code === "other_workspace" ? `Belongs to your workspace "${i.verdict.detail}". Switch to it (top left) to send.` : VERDICT_TEXT[i.verdict.code]}{i.verdict.detail && i.verdict.code === "country_gated" ? ` (${i.verdict.detail})` : ""}</li>)}{blocked.length > 8 && <li>and {blocked.length - 8} more</li>}</ul>
                {blocked.some((b) => b.verdict.code === "country_gated") && <p className="mt-1 text-xs text-muted-foreground">For recipients in gated countries, record their consent or an existing customer relationship first (Outreach, Consent).</p>}
              </div>
            )}
            {dropped.length > 0 && <p className="text-amber-700 dark:text-amber-300">Not copied: {dropped.slice(0, 5).map((d) => `${d.email} (${d.field}, ${d.reason === "suppressed" ? "opted out" : "needs consent"})`).join(", ")}. The message still goes to its recipient.</p>}
            {first && first.verdict.code === "ok" && (
              <div className="rounded-lg border border-foreground/10 p-3">
                <p className="text-xs text-muted-foreground">First message · to {first.name} &lt;{first.to}&gt;{first.cc.length ? ` · cc ${first.cc.join(", ")}` : ""}{first.bcc.length ? ` · bcc ${first.bcc.join(", ")}` : ""}</p>
                <p className="mt-1 font-medium">{first.subject}</p>
                <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap font-sans text-sm">{first.body}</pre>
              </div>
            )}
            <label className="block text-xs text-muted-foreground">Send after (optional)
              <input type="datetime-local" value={after} onChange={(e) => setAfter(e.target.value)} className="ml-2 rounded-md border border-foreground/15 bg-background px-2 py-1 text-sm text-foreground" /></label>
            {p.requiresTypedCount && (
              <label className="block">To approve {p.count} messages, type {p.count}:
                <input inputMode="numeric" value={typed} onChange={(e) => setTyped(e.target.value)} className="ml-2 w-24 rounded-md border border-foreground/15 bg-background px-2 py-1" aria-label="Type the number of messages to confirm" /></label>
            )}
            <p className="text-xs text-muted-foreground">Sent email cannot be recalled. You can stop anything that has not gone yet. The approval lasts 7 days.</p>
            {note && <p role="status" className="text-xs">{note}</p>}
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || p.count === 0 || (p.requiresTypedCount && Number(typed) !== p.count)} onClick={approve} className="rounded-md bg-foreground px-4 py-2 font-medium text-background disabled:opacity-50">{busy ? "Working…" : after ? `Approve ${p.count} for later` : `Approve and send ${p.count}`}</button>
              <button disabled={busy} onClick={test} className="rounded-md border border-foreground/15 px-3 py-2 disabled:opacity-50">Send me a test copy</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

interface Auth { id: string; status: string; approved_at: string; expires_at: string; summary: any; waiting: number; sent: number; not_sent: number }
/** What has been approved, how much has gone, and a way to stop the rest. */
export function SendAuthorizations({ refreshKey = 0 }: { refreshKey?: number }) {
  const [rows, setRows] = useState<Auth[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => { const r = await fetch("/api/outreach/send-authorizations", { cache: "no-store" }); setRows(r.ok ? (await r.json()).authorizations : null) }, [])
  useEffect(() => { void load() }, [load, refreshKey])
  async function revoke(id: string) {
    if (!confirm("Stop everything in this batch that has not been sent yet? Mail that has already gone cannot be recalled.")) return
    const r = await fetch(`/api/outreach/send-authorizations/${id}/revoke`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason: "Stopped from the sending list" }) })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? j.message : j.error ?? "Could not stop it."); await load()
  }
  if (!rows || rows.length === 0) return null
  return (
    <section className="rounded-lg border border-foreground/10 p-3 text-sm">
      <h3 className="mb-2 font-medium">Sending</h3>
      {msg && <p role="status" className="mb-2 text-xs">{msg}</p>}
      <ul className="divide-y divide-foreground/10">
        {rows.slice(0, 6).map((a) => (
          <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{a.summary?.count ?? a.sent + a.waiting} approved {new Date(a.approved_at).toLocaleDateString()} · {a.sent} sent{a.waiting ? `, ${a.waiting} waiting` : ""}{a.not_sent ? `, ${a.not_sent} not sent` : ""} · <span className="text-muted-foreground">{a.status}</span></span>
            {a.status === "active" && a.waiting > 0 && <button onClick={() => revoke(a.id)} className="rounded-md border border-foreground/15 px-2 py-0.5 text-xs">Stop the rest</button>}
          </li>))}
      </ul>
    </section>
  )
}
