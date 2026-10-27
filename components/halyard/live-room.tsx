"use client"
import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { startMicrophone, type Capture } from "./audio-capture"
import { createUploadQueue } from "@/lib/halyard/client/upload-queue"
import { createSseParser } from "@/lib/halyard/client/sse"

type Turn = { seq: number; channel: string; text: string }
type Sug = { id: string; action: string; text: string; ms?: number }
const ACTIONS: Array<[string, string]> = [["assist", "Assist"], ["say", "What should I say?"], ["followup", "Follow-up questions"], ["recap", "Recap"]]
const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
const btn = "rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"

export function LiveRoom({ id }: { id: string }) {
  const router = useRouter()
  const [state, setState] = useState<string>("loading"), [title, setTitle] = useState(""), [turns, setTurns] = useState<Turn[]>([]), [sugs, setSugs] = useState<Sug[]>([])
  const [listening, setListening] = useState(false), [speaking, setSpeaking] = useState(false), [muted, setMuted] = useState(false), [level, setLevel] = useState(0)
  const [notice, setNotice] = useState<string | null>(null), [pending, setPending] = useState(0), [retrying, setRetrying] = useState(false), [asking, setAsking] = useState(""), [busy, setBusy] = useState<string | null>(null)
  const capture = useRef<Capture | null>(null), seq = useRef(0), wake = useRef<any>(null), queue = useRef<ReturnType<typeof createUploadQueue> | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const r = await fetch(`/api/halyard/sessions/${id}`), d = await r.json().catch(() => ({}))
    if (!r.ok) { setNotice(d.error ?? "That session could not be opened."); setState("error"); return }
    setState(d.session.state); setTitle(d.session.title ?? ""); setTurns(d.turns ?? []); seq.current = (d.lastSeq ?? -1) + 1
    setSugs((d.suggestions ?? []).map((s: any) => ({ id: s.id, action: s.action, text: s.text, ms: s.ms })))
  }, [id])
  useEffect(() => { void load() }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }) }, [turns.length, sugs.length])
  useEffect(() => {
    document.title = listening ? "● Halyard — recording" : "Halyard session — Anker"
    if (!listening) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn)
  }, [listening])
  useEffect(() => () => { capture.current?.stop(); queue.current?.stop(); wake.current?.release?.().catch?.(() => {}) }, [])

  async function listen() {
    setNotice(null)
    const q = createUploadQueue({
      send: async (u) => {
        const f = new FormData(); f.append("audio", new Blob([u.wav as BlobPart], { type: "audio/wav" }), "u.wav"); f.append("seq", String(u.seq)); f.append("channel", u.channel); f.append("startedMs", String(u.startedMs)); f.append("endedMs", String(u.endedMs))
        const r = await fetch(`/api/halyard/sessions/${id}/utterances`, { method: "POST", body: f }); const b = await r.json().catch(() => ({}))
        return r.ok ? { ok: true as const, body: b } : { ok: false as const, status: r.status, message: b.error ?? "The audio could not be sent." }
      },
      onAck: (u, body) => { if (body?.stored && body.text) setTurns((t) => [...t, { seq: u.seq, channel: "room", text: body.text }]) },
      onDrop: (_u, _why, m) => setNotice(m),
      onStatus: (s) => { setPending(s.pending); setRetrying(s.retrying) },
    })
    queue.current = q
    try {
      capture.current = await startMicrophone({
        onUtterance: (u) => q.push({ seq: seq.current++, channel: "room", startedMs: u.startedMs, endedMs: u.endedMs, wav: u.wav }),
        onSpeaking: setSpeaking, onLevel: setLevel, onError: (m) => { setNotice(m); setListening(false) },
      })
      setListening(true)
      try { wake.current = await (navigator as any).wakeLock?.request("screen") } catch { /* the screen may sleep; not fatal */ }
    } catch (e: any) { setNotice(e.message) }
  }
  function stopListening() { capture.current?.stop(); capture.current = null; setListening(false); setSpeaking(false); wake.current?.release?.().catch?.(() => {}) }

  async function act(action: string, question?: string) {
    setBusy(action); setNotice(null)
    try {
      const r = await fetch(`/api/halyard/sessions/${id}/act`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, question }) })
      if (!r.ok || !r.body) { const d = await r.json().catch(() => ({})); setNotice(d.error ?? "That did not work."); return }
      const reader = r.body.getReader(), dec = new TextDecoder(), parse = createSseParser((ev, d) => { if (ev === "suggestion") setSugs((s) => [...s, { id: d.suggestionId, action, text: d.text, ms: d.totalMs }]) })
      for (;;) { const { done, value } = await reader.read(); if (done) break; parse(dec.decode(value, { stream: true })) }
      if (action === "ask") setAsking("")
    } catch { setNotice("The connection dropped. Try again.") } finally { setBusy(null) }
  }
  async function end() {
    if (!confirm("End this session? The transcript is kept for your workspace's retention period.")) return
    stopListening(); await queue.current?.flush()
    const r = await fetch(`/api/halyard/sessions/${id}/end`, { method: "POST" })
    if (r.ok) { setState("ended"); router.refresh() } else setNotice("The session could not be ended. Try again.")
  }
  async function remove() {
    if (!confirm("Delete this session and everything in it? This cannot be undone.")) return
    stopListening(); const r = await fetch(`/api/halyard/sessions/${id}`, { method: "DELETE" })
    if (r.ok) router.push("/dashboard/halyard"); else setNotice("It could not be deleted.")
  }

  if (state === "loading") return <p role="status" className="p-8">Opening session…</p>
  if (state === "error") return <div className="p-8 space-y-3"><p role="alert">{notice}</p><a className="underline" href="/dashboard/halyard">Back to Halyard</a></div>
  const live = state === "live"
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Halyard · {state}</p><h1 className="text-2xl">{title || "Session"}</h1></div>
        <div className="flex items-center gap-3 text-sm" aria-live="polite">
          {listening && <span className="flex items-center gap-2"><span className={`inline-block h-3 w-3 rounded-full ${speaking ? "bg-red-500" : "bg-red-300"}`} aria-hidden /> Recording</span>}
          {listening && <span aria-hidden className="inline-block h-2 w-16 overflow-hidden rounded bg-muted"><span className="block h-full bg-foreground" style={{ width: `${Math.min(100, level * 400)}%` }} /></span>}
          {retrying ? <span className="text-destructive">Reconnecting… {pending} waiting</span> : pending > 0 ? <span className="text-muted-foreground">{pending} sending</span> : null}
        </div>
      </header>
      {notice && <p role="alert" className="rounded-md border border-border p-3 text-sm text-destructive">{notice}</p>}
      {live && <div className="flex flex-wrap gap-2">
        {!listening ? <button className={btn} onClick={listen}>{turns.length ? "Resume listening" : "Start listening"}</button> : <>
          <button className={btn} onClick={() => { capture.current?.setMuted(!muted); setMuted(!muted) }}>{muted ? "Unmute" : "Mute"}</button>
          <button className={btn} onClick={stopListening}>Stop listening</button></>}
        <button className={btn} onClick={end}>End session</button>
      </div>}
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="tr" className="rounded-md border border-border"><h2 id="tr" className="border-b border-border px-3 py-2 text-sm font-medium">Transcript</h2>
          <ol className="max-h-[55vh] space-y-2 overflow-y-auto p-3 text-sm" aria-live="polite">{turns.length === 0 ? <li className="text-muted-foreground">{live ? "Nothing yet. Start listening and speak." : "No transcript."}</li> : turns.map((t) => <li key={t.seq}>{t.text}</li>)}</ol></section>
        <section aria-labelledby="sg" className="rounded-md border border-border"><h2 id="sg" className="border-b border-border px-3 py-2 text-sm font-medium">Suggestions</h2>
          <ol className="max-h-[55vh] space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">{sugs.length === 0 ? <li className="text-muted-foreground">Use the buttons below at any time during the call.</li> : sugs.map((s) => <li key={s.id} className="rounded-md bg-muted p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{ACTIONS.find((a) => a[0] === s.action)?.[1] ?? "Ask"}{s.ms ? ` · ${(s.ms / 1000).toFixed(1)} s` : ""}</p><p className="whitespace-pre-wrap">{s.text}</p></li>)}<div ref={endRef} /></ol></section>
      </div>
      {state !== "abandoned" && <div className="space-y-2">
        <div className="flex flex-wrap gap-2">{ACTIONS.map(([a, l]) => <button key={a} className={btn} disabled={!!busy || turns.length === 0} onClick={() => act(a)}>{busy === a ? "Thinking…" : l}</button>)}</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (asking.trim()) void act("ask", asking) }}>
          <input className={field} value={asking} onChange={(e) => setAsking(e.target.value)} maxLength={500} placeholder="Ask anything about the call…" aria-label="Ask a question about the call" />
          <button className={btn} disabled={!!busy || !asking.trim() || turns.length === 0}>Ask</button></form>
      </div>}
      <footer className="flex justify-between border-t border-border pt-3 text-xs text-muted-foreground"><span>Only suggestions are made here; nothing is sent or changed for you.</span><button className="underline" onClick={remove}>Delete this session</button></footer>
    </div>
  )
}
