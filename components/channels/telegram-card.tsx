"use client"

import { useCallback, useEffect, useState } from "react"

interface Link { id: string; mine: boolean; username: string | null; mode: string; status: string; linkedAt: string; lastSeenAt: string | null }
interface State { available: boolean; reason: string | null; bot: string | null; canManageAll: boolean; ttlMinutes: number; links: Link[] }
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
  async function act(id: string, action: "confirm" | "revoke" | "reactivate") {
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/telegram/links/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) })
    if (!r.ok) setMsg((await r.json().catch(() => ({}))).error ?? "That did not work.")
    setBusy(false); await load()
  }
  const btn = "h-9 rounded-md border px-4 text-sm disabled:opacity-50"

  if (!s) return <p className="text-sm text-muted-foreground" aria-live="polite">Loading…</p>
  return (
    <section className="rounded-xl border p-5" aria-labelledby="tg-h">
      <h2 id="tg-h" className="text-lg font-semibold">Telegram</h2>
      <p className="mt-1 text-sm text-muted-foreground">Ask Anker AI about this workspace from your phone. Messages pass through Telegram, which is a separate company and does not encrypt bot chats end to end. For now the bot is read-only: it answers, it does not change anything.</p>
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
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
                <span>{l.username ? `@${l.username}` : "Telegram account"}{l.mine ? "" : " (a colleague's)"} · {STATUS[l.status] ?? l.status} · {l.mode === "write" ? "read and write" : "read-only"}</span>
                <span className="flex gap-2">
                  {l.mine && l.status === "pending" && <button className={btn} disabled={busy} onClick={() => act(l.id, "confirm")}>Approve this device</button>}
                  {l.mine && l.status === "suspended" && <button className={btn} disabled={busy} onClick={() => act(l.id, "reactivate")}>Approve again</button>}
                  {(l.mine || s.canManageAll) && <button className={btn} disabled={busy} onClick={() => act(l.id, "revoke")}>Disconnect</button>}
                </span>
              </li>
            ))}
            {s.links.length === 0 && <li className="text-sm text-muted-foreground">No devices connected.</li>}
          </ul>
        </div>
      )}
    </section>
  )
}
