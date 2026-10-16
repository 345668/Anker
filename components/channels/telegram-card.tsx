"use client"

import { useCallback, useEffect, useState } from "react"

interface Prefs { approvals: boolean; replies: boolean; deadlines: boolean; voiceReplies: boolean; dailyBrief: boolean }
interface Link { id: string; mine: boolean; username: string | null; mode: string; status: string; linkedAt: string; lastSeenAt: string | null; prefs: Prefs }
interface State { available: boolean; reason: string | null; bot: string | null; canManageAll: boolean; canWrite: boolean; ttlMinutes: number; links: Link[] }
const STATUS: Record<string, string> = { pending: "Waiting for your approval", active: "Connected", suspended: "Paused (idle for a long time)" }

export function TelegramCard() {
  const [s, setS] = useState<State | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => { const r = await fetch("/api/telegram/links", { cache: "no-store" }); setS(r.ok ? await r.json() : null) }, [])
  useEffect(() => { void load(); const t = setInterval(load, 8000); return () => clearInterval(t) }, [load])

  async function code() {
    setBusy(true); setMsg(null)
    const r = await fetch("/api/telegram/links", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "code" }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) setUrl(j.url); else setMsg(j.error ?? "Could not start. Try again.")
    setBusy(false)
  }
  async function act(id: string, action: "confirm" | "revoke" | "reactivate" | "mode" | "prefs", extra: Record<string, unknown> = {}) {
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/telegram/links/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, ...extra }) })
    if (!r.ok) setMsg((await r.json().catch(() => ({}))).error ?? "That did not work.")
    setBusy(false); await load()
  }
  const btn = "h-9 rounded-md border px-4 text-sm disabled:opacity-50"

  if (!s) return <p className="text-sm text-muted-foreground" aria-live="polite">Loading…</p>
  return (
    <section className="rounded-xl border p-5" aria-labelledby="tg-h">
      <h2 id="tg-h" className="text-lg font-semibold">Telegram</h2>
      <p className="mt-1 text-sm text-muted-foreground">Ask Anker AI about this workspace from your phone. Messages pass through Telegram, which is a separate company and does not encrypt bot chats end to end. By default the bot only answers. If you switch on \"Allow changes\" for a device, it can propose changes to your records, and nothing is changed until you tap Approve. It never sends email or messages to other people from the chat.</p>
      {!s.available ? <p className="mt-3 text-sm" role="status">{s.reason ?? "Telegram is not available for this workspace."}</p> : (
        <div className="mt-4 space-y-3">
          {url ? (
            <div className="rounded-md border p-3 text-sm">
              <p>Open this link <strong>on your phone</strong>, press Start in Telegram, then come back here and approve the device. The link works once, for {s.ttlMinutes} minutes.</p>
              <p className="mt-2 break-all"><a className="underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a></p>
            </div>
          ) : <button className={btn} disabled={busy} onClick={code}>Connect Telegram</button>}
          {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
          <ul className="space-y-2">
            {s.links.map((l) => (
              <li key={l.id} className="rounded-md border p-3 text-sm">
               <div className="flex flex-wrap items-center justify-between gap-2">
                <span>{l.username ? `@${l.username}` : "Telegram account"}{l.mine ? "" : " (a colleague's)"} · {STATUS[l.status] ?? l.status} · {l.mode === "write" ? "may propose changes" : "read-only"}</span>
                <span className="flex gap-2">
                  {l.mine && l.status === "pending" && <button className={btn} disabled={busy} onClick={() => act(l.id, "confirm")}>Approve this device</button>}
                  {l.mine && l.status === "suspended" && <button className={btn} disabled={busy} onClick={() => act(l.id, "reactivate")}>Approve again</button>}
                  {(l.mine || s.canManageAll) && <button className={btn} disabled={busy} onClick={() => act(l.id, "revoke")}>Disconnect</button>}
                </span>
               </div>
               {l.mine && l.status === "active" && (
                <div className="mt-3 space-y-2 border-t pt-3">
                  <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={l.mode === "write"} disabled={busy || !s.canWrite} onChange={(e) => act(l.id, "mode", { mode: e.target.checked ? "write" : "read" })} /><span>Allow changes. The bot proposes, you approve each change with a tap.{!s.canWrite ? " (Your role in this workspace cannot make changes.)" : ""}</span></label>
                  <fieldset><legend className="font-medium">Message me when</legend>
                    {([["approvals", "changes are waiting for my approval"], ["replies", "someone replies to my outreach"], ["deadlines", "tasks are due (once each morning)"], ["dailyBrief", "send me a short brief each morning (replaces the task message; names the tasks)"]] as const).map(([k, t]) => (
                      <label key={k} className="mt-1 flex items-center gap-2"><input type="checkbox" checked={l.prefs[k]} disabled={busy} onChange={(e) => act(l.id, "prefs", { ...l.prefs, [k]: e.target.checked })} />{t}</label>))}
                    <label className="mt-2 flex items-center gap-2"><input type="checkbox" checked={l.prefs.voiceReplies} disabled={busy} onChange={(e) => act(l.id, "prefs", { ...l.prefs, voiceReplies: e.target.checked })} />Also read my answers aloud (a short voice message after the text)</label>
                    <p className="mt-1 text-xs text-muted-foreground">Notifications say how many, never who or what; the morning brief is the exception and lists task titles. Nothing is sent between 22:00 and 07:00 Berlin time; it waits for the morning.</p>
                  </fieldset>
                </div>)}
              </li>
            ))}
            {s.links.length === 0 && <li className="text-sm text-muted-foreground">No devices connected.</li>}
          </ul>
        </div>
      )}
    </section>
  )
}
