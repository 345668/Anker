"use client"
import { useCallback, useEffect, useState } from "react"
import { TEXTS } from "@/lib/investor/legal"
import { call, field, btn, btnGhost } from "./api"

/** The conversation for one request. `base` is the API path of the request: /api/investor/requests/<id> or /api/fund/investor-requests/<id>. */
export function Thread({ base, me, canWrite = true }: { base: string; me: "investor" | "fund"; canWrite?: boolean }) {
  const [t, setT] = useState<any>(null), [files, setFiles] = useState<File[]>([]), [text, setText] = useState(""), [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const load = useCallback(() => call(`${base}/messages`).then(setT).catch((e) => setErr(e.message)), [base])
  useEffect(() => { void load() }, [load])
  async function send(e: React.FormEvent) {
    e.preventDefault(); if ((!text.trim() && !files.length) || busy) return
    setBusy(true); setErr(null)
    try {
      if (files.length) {
        const f = new FormData(); f.set("body", text); for (const x of files) f.append("file", x)
        const r = await fetch(`${base}/messages`, { method: "POST", body: f, credentials: "same-origin" }); const d = await r.json().catch(() => null)
        if (!r.ok) throw new Error(d?.error || "The message could not be sent.")
      } else await call(`${base}/messages`, { method: "POST", body: { body: text } })
      setText(""); setFiles([]); await load()
    } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") } finally { setBusy(false) }
  }
  async function pref(action: "mute" | "unmute" | "block") {
    if (action === "block" && !window.confirm("Block this conversation? It will be closed and cannot be reopened.")) return
    try { await call(`${base}/prefs`, { method: "POST", body: { action } }); await load() } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") }
  }
  if (!t) return err ? <p role="alert" className="text-sm">{err}</p> : <p role="status" className="text-sm">Loading…</p>
  return <div className="mt-3 space-y-3 rounded-md border bg-muted/20 p-3 text-sm">
    {t.messages.length === 0 ? <p className="text-muted-foreground">No messages yet.</p> :
      <ul className="max-h-80 space-y-2 overflow-y-auto">{t.messages.map((m: any) => <li key={m.id} className={m.from === me ? "text-right" : ""}>
        <p className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-md px-3 py-2 text-left ${m.from === me ? "bg-foreground text-background" : "bg-background border"}`}>{m.body}</p>
        {m.attachments?.length > 0 && <span className="block text-xs">{m.attachments.map((a: any) => <a key={a.id} className="mr-3 underline" href={`${base}/messages/files/${a.id}`} target="_blank" rel="noreferrer">{a.filename} ({Math.max(1, Math.round(a.sizeBytes / 1024))} KB)</a>)}</span>}
        <p className="text-xs text-muted-foreground">{m.from === me ? "You" : me === "investor" ? "The fund" : "The investor"} · {new Date(m.at).toLocaleString()}</p></li>)}</ul>}
    {t.writable && canWrite ? <form onSubmit={send} className="space-y-2"><textarea className={field} rows={3} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write a message" aria-label="Message" />
      <label className="block text-xs text-muted-foreground">{TEXTS.attachmentWarning.text}<input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="mt-1 block text-xs" onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 3))} /></label>
      {files.length > 0 && <p className="text-xs">{files.map((f) => f.name).join(", ")}</p>}
      <div className="flex items-center gap-2"><button className={btn} disabled={busy || (!text.trim() && !files.length)}>{busy ? "Sending…" : "Send"}</button>
        <button type="button" className={btnGhost} onClick={() => pref(t.muted ? "unmute" : "mute")}>{t.muted ? "Unmute notifications" : "Mute notifications"}</button>
        <button type="button" className={btnGhost} onClick={() => pref("block")}>Block</button></div></form>
      : <p className="text-muted-foreground">{t.blocked ? "This conversation is closed." : t.stage === "interested" ? "You can write once the fund has accepted." : "This conversation is closed."}</p>}
    {err && <p role="alert" className="text-red-600">{err}</p>}
  </div>
}
