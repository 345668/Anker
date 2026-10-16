"use client"

import { useCallback, useEffect, useState } from "react"

interface Prefs { approvals: boolean; replies: boolean; deadlines: boolean; voiceReplies: boolean; dailyBrief: boolean }
interface Link { id: string; mine: boolean; username: string | null; mode: string; status: string; linkedAt: string; lastSeenAt: string | null; prefs: Prefs }
interface State { available: boolean; reason: string | null; bot: string | null; botKind: "personal" | "workspace" | "shared" | null; canManageBot: boolean; canManageAll: boolean; canWrite: boolean; ttlMinutes: number; links: Link[] }
const STATUS: Record<string, string> = { pending: "Waiting for your approval", active: "Connected", suspended: "Paused (idle for a long time)" }

interface BotInfo { id: string; username: string; connectedAt: string; webhookOk: boolean; pending: number; lastError: string | null }
interface BotsState { gate: string | null; canManageWorkspace: boolean; personal: BotInfo | null; workspace: BotInfo | null; others: Array<{ id: string; username: string; userId: string; connectedAt: string }> }
type Scope = "personal" | "workspace"

/** One bot slot: connect, check and remove. The token is typed once, sent over HTTPS, stored encrypted and never shown again. */
function BotSlot({ scope, title, blurb, bot, canEdit, onChange }: { scope: Scope; title: string; blurb: string; bot: BotInfo | null; canEdit: boolean; onChange: () => void }) {
  const [token, setToken] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  async function connect(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const r = await fetch("/api/telegram/bot", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope, token }) })
    const j = await r.json().catch(() => ({}))
    if (r.ok) { setToken(""); onChange() } else setMsg(j.error ?? "Could not connect the bot.")
    setBusy(false)
  }
  async function remove() {
    if (!window.confirm("Disconnect this bot? Every phone connected through it is disconnected too, and the saved token is deleted.")) return
    setBusy(true); setMsg(null)
    const r = await fetch("/api/telegram/bot", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ scope }) })
    if (!r.ok) setMsg((await r.json().catch(() => ({}))).error ?? "Could not disconnect.")
    setBusy(false); onChange()
  }
  const btn = "h-9 rounded-md border px-4 text-sm disabled:opacity-50"
  return (
    <div className="rounded-md border p-4 text-sm">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{blurb}</p>
      {bot ? (
        <div className="mt-2 space-y-2">
          <p>Connected: <strong>@{bot.username}</strong>. {bot.webhookOk ? "Telegram is delivering messages to Anker." : "Telegram is not delivering messages yet. Disconnect and connect the bot again."}</p>
          {bot.lastError && <p className="text-xs text-amber-700">Telegram reported: {bot.lastError}</p>}
          <p className="text-xs text-muted-foreground">The token is stored encrypted and is never shown again. To cut off access completely, also send /revoke to @BotFather.</p>
          {canEdit && <button className={btn} disabled={busy} onClick={remove}>Disconnect this bot</button>}
        </div>
      ) : !canEdit ? <p className="mt-2 text-muted-foreground">Not connected. Only a workspace owner or admin can connect this one.</p> : (
        <form onSubmit={connect} className="mt-2 space-y-3">
          <ol className="list-decimal space-y-1 pl-5">
            <li>In Telegram, open <a className="underline" href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer">@BotFather</a> and send <code>/newbot</code>.</li>
            <li>Choose a name and a username ending in <code>bot</code>.</li>
            <li>BotFather replies with a token. Paste it here.</li>
          </ol>
          <label className="block"><span className="font-medium">Bot token</span>
            <input type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456789:AA…" className="mt-1 h-9 w-full max-w-md rounded-md border bg-transparent px-3 text-sm" />
          </label>
          <p className="text-xs text-muted-foreground">Anker checks the token with Telegram, saves it encrypted and sets up the connection. You do not need to change anything anywhere else.</p>
          <button className={btn} disabled={busy || token.trim().length < 20}>Connect bot</button>
        </form>
      )}
      {msg && <p role="alert" className="mt-2 text-sm text-red-600">{msg}</p>}
    </div>
  )
}

/** Your own bot, the workspace's bot, and (for owners and admins) everyone else's. A member's phone uses their own bot first, then the workspace's, then Anker's shared bot. */
function BotPanel({ onChange }: { onChange: () => void }) {
  const [st, setSt] = useState<BotsState | null>(null)
  const load = useCallback(async () => { const r = await fetch("/api/telegram/bot", { cache: "no-store" }); setSt(r.ok ? await r.json() : null) }, [])
  useEffect(() => { void load() }, [load])
  const changed = () => { void load(); onChange() }
  async function removeOther(id: string) {
    if (!window.confirm("Disconnect this member's bot? Their phones connected through it are disconnected and the saved token is deleted.")) return
    await fetch("/api/telegram/bot", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ botId: id }) }); changed()
  }
  if (!st) return null
  return (
    <div className="mt-4 space-y-3">
      <BotSlot scope="personal" title="Your own bot" blurb="Only you can connect a phone through it. Use it if you want a bot that belongs to you, not to the workspace." bot={st.personal} canEdit onChange={changed} />
      <BotSlot scope="workspace" title="The workspace's bot" blurb="Shared by the people in this workspace: each links their own phone to it. Used by anyone who has no bot of their own." bot={st.workspace} canEdit={st.canManageWorkspace} onChange={changed} />
      {st.others.length > 0 && (
        <div className="rounded-md border p-4 text-sm">
          <h3 className="font-medium">Members' own bots</h3>
          <ul className="mt-2 space-y-1">{st.others.map((o) => <li key={o.id} className="flex items-center justify-between gap-2"><span>@{o.username}</span><button className="h-8 rounded-md border px-3 text-xs" onClick={() => removeOther(o.id)}>Disconnect</button></li>)}</ul>
        </div>)}
    </div>
  )
}

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
      {s.botKind && s.bot && <p className="mt-2 text-sm">Your phone uses {s.botKind === "personal" ? "your own bot" : s.botKind === "workspace" ? "the workspace's bot" : "Anker's shared bot"}: <strong>@{s.bot}</strong>.</p>}
      <BotPanel onChange={load} />
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
