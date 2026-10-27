"use client"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { useRouter } from "next/navigation"
import { startSource, type Capture } from "./audio-capture"
import { openPanelWindow } from "./panel-window"
import { createUploadQueue } from "@/lib/halyard/client/upload-queue"
import { indexedDbStore } from "@/lib/halyard/client/queue-store"
import { browserFacts, checkBrowser } from "@/lib/halyard/client/browser-check"
import { createSseParser } from "@/lib/halyard/client/sse"

type Turn = { seq: number; channel: string; text: string }
type Sug = { id: string; action: string; text: string; ms?: number }
const ACTIONS: Array<[string, string]> = [["assist", "Assist"], ["say", "What should I say?"], ["followup", "Follow-up questions"], ["recap", "Recap"]]
const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
const btn = "rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
const LABEL: Record<string, string> = { you: "You", them: "Them", room: "" }

export function LiveRoom({ id }: { id: string }) {
  const router = useRouter()
  const [state, setState] = useState<string>("loading"), [title, setTitle] = useState(""), [turns, setTurns] = useState<Turn[]>([]), [sugs, setSugs] = useState<Sug[]>([])
  const [listening, setListening] = useState(false), [tabOn, setTabOn] = useState(false), [speaking, setSpeaking] = useState(false), [muted, setMuted] = useState(false), [level, setLevel] = useState(0)
  const [notice, setNotice] = useState<string | null>(null), [pending, setPending] = useState(0), [retrying, setRetrying] = useState(false), [online, setOnline] = useState(true)
  const [asking, setAsking] = useState(""), [busy, setBusy] = useState<string | null>(null), [win, setWin] = useState<Window | null>(null), [check, setCheck] = useState<ReturnType<typeof checkBrowser> | null>(null)
  const mic = useRef<Capture | null>(null), tab = useRef<Capture | null>(null), tabFlag = useRef(false), seq = useRef(0), t0 = useRef(0), wake = useRef<any>(null)
  const queue = useRef<ReturnType<typeof createUploadQueue> | null>(null), store = useRef<ReturnType<typeof indexedDbStore> | null>(null), endRef = useRef<HTMLDivElement>(null)
  useEffect(() => { setCheck(checkBrowser(browserFacts())); setOnline(navigator.onLine) }, [])

  const ensureQueue = useCallback(() => {
    if (queue.current) return queue.current
    store.current = store.current ?? indexedDbStore()
    queue.current = createUploadQueue({
      store: store.current, sessionId: id,
      send: async (u) => {
        const f = new FormData(); f.append("audio", new Blob([u.wav as BlobPart], { type: "audio/wav" }), "u.wav"); f.append("seq", String(u.seq)); f.append("channel", u.channel); f.append("startedMs", String(u.startedMs)); f.append("endedMs", String(u.endedMs))
        const r = await fetch(`/api/halyard/sessions/${id}/utterances`, { method: "POST", body: f }); const b = await r.json().catch(() => ({}))
        return r.ok ? { ok: true as const, body: b } : { ok: false as const, status: r.status, message: b.error ?? "The audio could not be sent." }
      },
      onAck: (u, body) => { if (body?.stored && body.text) setTurns((t) => [...t, { seq: u.seq, channel: u.channel, text: body.text }].sort((a, b) => a.seq - b.seq)) },
      onDrop: (_u, _why, m) => setNotice(m),
      onStatus: (s) => { setPending(s.pending); setRetrying(s.retrying) },
    })
    return queue.current
  }, [id])

  const load = useCallback(async () => {
    const r = await fetch(`/api/halyard/sessions/${id}`), d = await r.json().catch(() => ({}))
    if (!r.ok) { setNotice(d.error ?? "That session could not be opened."); setState("error"); return }
    setState(d.session.state); setTitle(d.session.title ?? ""); setTurns(d.turns ?? []); seq.current = (d.lastSeq ?? -1) + 1
    setSugs((d.suggestions ?? []).map((s: any) => ({ id: s.id, action: s.action, text: s.text, ms: s.ms })))
    if (d.session.state === "live") {   // audio an earlier page left unsent (a reload, a crash) goes up first, and new numbers continue after it
      const left = await ensureQueue().restore()
      if (left.length) { seq.current = Math.max(seq.current, ...left.map((u) => u.seq + 1)); setNotice(`${left.length} piece${left.length > 1 ? "s" : ""} of audio from before the reload ${left.length > 1 ? "are" : "is"} being sent.`) }
    }
  }, [id, ensureQueue])
  useEffect(() => { void load() }, [load])
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }) }, [turns.length, sugs.length])
  useEffect(() => {
    document.title = listening ? "● Halyard — recording" : "Halyard session — Anker"
    if (!listening) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = "" }
    window.addEventListener("beforeunload", warn); return () => window.removeEventListener("beforeunload", warn)
  }, [listening])
  useEffect(() => { const up = () => setOnline(true), down = () => setOnline(false); window.addEventListener("online", up); window.addEventListener("offline", down); return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down) } }, [])
  // The wake lock is released by the browser when the tab is hidden; take it again when the tab is visible and we are still listening.
  useEffect(() => {
    if (!listening) return
    const again = async () => { if (document.visibilityState === "visible") try { wake.current = await (navigator as any).wakeLock?.request("screen") } catch { /* the screen may sleep; not fatal */ } }
    document.addEventListener("visibilitychange", again); return () => document.removeEventListener("visibilitychange", again)
  }, [listening])
  useEffect(() => () => { mic.current?.stop(); tab.current?.stop(); queue.current?.stop(); wake.current?.release?.().catch?.(() => {}) }, [])
  useEffect(() => { if (!win) return; const gone = () => setWin(null); win.addEventListener("pagehide", gone); return () => win.removeEventListener("pagehide", gone) }, [win])

  const events = (channelOf: () => "you" | "them" | "room", onEnded: (m: string) => void) => ({
    onUtterance: (u: { wav: Uint8Array; startedMs: number; endedMs: number }) => ensureQueue().push({ seq: seq.current++, channel: channelOf(), startedMs: u.startedMs, endedMs: u.endedMs, wav: u.wav }),
    onSpeaking: setSpeaking, onLevel: setLevel, onEnded,
  })
  async function listen() {
    setNotice(null); ensureQueue(); t0.current = Date.now()
    try {
      mic.current = await startSource("microphone", t0.current, events(() => (tabFlag.current ? "you" : "room"), (m) => { setNotice(m); setListening(false) }))
      setListening(true)
      try { wake.current = await (navigator as any).wakeLock?.request("screen") } catch { /* the screen may sleep; not fatal */ }
    } catch (e: any) { setNotice(e.message) }
  }
  async function addTab() {
    setNotice(null)
    try {
      tab.current = await startSource("tab", t0.current || (t0.current = Date.now()), events(() => "them", (m) => { setNotice(m); tab.current = null; tabFlag.current = false; setTabOn(false) }))
      tabFlag.current = true; setTabOn(true)
    } catch (e: any) { setNotice(e.message) }
  }
  function stopListening() { mic.current?.stop(); mic.current = null; tab.current?.stop(); tab.current = null; tabFlag.current = false; setTabOn(false); setListening(false); setSpeaking(false); wake.current?.release?.().catch?.(() => {}) }
  async function popOut() { const w = await openPanelWindow(); if (w) setWin(w); else setNotice("The panel window was blocked. Allow pop-ups for this site, or keep using this page.") }

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
    if (r.ok) { await store.current?.clear(id); win?.close(); setState("ended"); router.refresh() } else setNotice("The session could not be ended. Try again.")
  }
  async function remove() {
    if (!confirm("Delete this session and everything in it? This cannot be undone.")) return
    stopListening(); queue.current?.stop(); const r = await fetch(`/api/halyard/sessions/${id}`, { method: "DELETE" })
    if (r.ok) { await store.current?.clear(id); win?.close(); router.push("/dashboard/halyard") } else setNotice("It could not be deleted.")
  }

  const panel = useMemo(() => (
    <div className="space-y-3">
      <section aria-labelledby="sg" className="rounded-md border border-border"><h2 id="sg" className="border-b border-border px-3 py-2 text-sm font-medium">Suggestions</h2>
        <ol className="max-h-[45vh] space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">{sugs.length === 0 ? <li className="text-muted-foreground">Use the buttons below at any time during the call.</li> : sugs.map((s) => <li key={s.id} className="rounded-md bg-muted p-3"><p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">{ACTIONS.find((a) => a[0] === s.action)?.[1] ?? "Ask"}{s.ms ? ` · ${(s.ms / 1000).toFixed(1)} s` : ""}</p><p className="whitespace-pre-wrap">{s.text}</p></li>)}<div ref={endRef} /></ol></section>
      {state !== "abandoned" && <div className="space-y-2">
        <div className="flex flex-wrap gap-2">{ACTIONS.map(([a, l]) => <button key={a} className={btn} disabled={!!busy || turns.length === 0} onClick={() => act(a)}>{busy === a ? "Thinking…" : l}</button>)}</div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (asking.trim()) void act("ask", asking) }}>
          <input className={field} value={asking} onChange={(e) => setAsking(e.target.value)} maxLength={500} placeholder="Ask anything about the call…" aria-label="Ask a question about the call" />
          <button className={btn} disabled={!!busy || !asking.trim() || turns.length === 0}>Ask</button></form></div>}
    </div>
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ), [sugs, busy, asking, turns.length, state])

  if (state === "loading") return <p role="status" className="p-8">Opening session…</p>
  if (state === "error") return <div className="p-8 space-y-3"><p role="alert">{notice}</p><a className="underline" href="/dashboard/halyard">Back to Halyard</a></div>
  const live = state === "live"
  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div><p className="text-xs uppercase tracking-widest text-muted-foreground">Halyard · {state}</p><h1 className="text-2xl">{title || "Session"}</h1></div>
        <div className="flex items-center gap-3 text-sm" aria-live="polite">
          {listening && <span className="flex items-center gap-2"><span className={`inline-block h-3 w-3 rounded-full ${speaking ? "bg-red-500" : "bg-red-300"}`} aria-hidden /> Recording{tabOn ? " · you + meeting tab" : ""}</span>}
          {listening && <span aria-hidden className="inline-block h-2 w-16 overflow-hidden rounded bg-muted"><span className="block h-full bg-foreground" style={{ width: `${Math.min(100, level * 400)}%` }} /></span>}
          {!online ? <span className="text-destructive">Offline · audio is kept and sent when you are back{pending ? ` (${pending} waiting)` : ""}</span> : retrying ? <span className="text-destructive">Reconnecting… {pending} waiting</span> : pending > 0 ? <span className="text-muted-foreground">{pending} sending</span> : null}
        </div>
      </header>
      {notice && <p role="alert" className="rounded-md border border-border p-3 text-sm text-destructive">{notice}</p>}
      {live && check && !check.canListen && <p role="alert" className="text-sm text-destructive">{check.problem}</p>}
      {live && check?.canListen && !listening && <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">{check.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      {live && <div className="flex flex-wrap gap-2">
        {!listening ? <button className={btn} disabled={!check?.canListen} onClick={listen}>{turns.length ? "Resume listening" : "Start listening"}</button> : <>
          {check?.tabAudio && !tabOn && <button className={btn} onClick={addTab}>Add the meeting tab's audio</button>}
          <button className={btn} onClick={() => { mic.current?.setMuted(!muted); setMuted(!muted) }}>{muted ? "Unmute microphone" : "Mute microphone"}</button>
          <button className={btn} onClick={stopListening}>Stop listening</button></>}
        {!win && <button className={btn} onClick={popOut}>Pop out the panel</button>}
        <button className={btn} onClick={end}>End session</button>
      </div>}
      <div className={win ? "" : "grid gap-4 lg:grid-cols-2"}>
        <section aria-labelledby="tr" className="rounded-md border border-border"><h2 id="tr" className="border-b border-border px-3 py-2 text-sm font-medium">Transcript</h2>
          <ol className="max-h-[55vh] space-y-2 overflow-y-auto p-3 text-sm" aria-live="polite">{turns.length === 0 ? <li className="text-muted-foreground">{live ? "Nothing yet. Start listening and speak." : "No transcript."}</li> : turns.map((t) => <li key={t.seq}>{LABEL[t.channel] ? <strong className="mr-1">{LABEL[t.channel]}:</strong> : null}{t.text}</li>)}</ol></section>
        {win ? <div className="mt-4 rounded-md border border-border p-3 text-sm"><p>The suggestions and buttons are in the panel window.</p><button className={btn + " mt-2"} onClick={() => { win.close(); setWin(null) }}>Bring them back here</button></div> : panel}
      </div>
      {win && createPortal(panel, win.document.body)}
      <footer className="flex justify-between border-t border-border pt-3 text-xs text-muted-foreground"><span>Only suggestions are made here; nothing is sent or changed for you.</span><button className="underline" onClick={remove}>Delete this session</button></footer>
    </div>
  )
}
