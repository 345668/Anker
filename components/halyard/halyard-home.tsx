"use client"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { browserProblem } from "./audio-capture"

const MODES: Array<[string, string]> = [["general", "General"], ["sales-call", "Sales call"], ["founder-investor-call", "Investor call (I am the founder)"], ["vc-investor-call", "Investor call (I am the investor)"]]
type Row = { id: string; title: string | null; mode: string; state: string; startedAt: string; audioSeconds: number }
const field = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"

export function HalyardHome() {
  const router = useRouter()
  const [mode, setMode] = useState("general"), [title, setTitle] = useState(""), [attested, setAttested] = useState(false), [informed, setInformed] = useState(false)
  const [custom, setCustom] = useState<Array<{ mode: string; label: string; scope: string }>>([]), [cfg, setCfg] = useState<{ retentionMonths: number; requireInformed: boolean; canEdit: boolean } | null>(null), [cfgMsg, setCfgMsg] = useState<string | null>(null), [shared, setShared] = useState<Array<Row & { ownerName: string }>>([]), [q, setQ] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [rows, setRows] = useState<Row[]>([]), [problem, setProblem] = useState<string | null>(null)
  useEffect(() => { setProblem(browserProblem()); fetch("/api/halyard/playbooks").then((r) => r.json()).then((d) => setCustom((d.playbooks ?? []).map((p: any) => ({ mode: p.mode, label: p.label, scope: p.scope })))).catch(() => {}); fetch("/api/halyard/settings").then((r) => r.json()).then((d) => { if (d.retentionMonths) setCfg(d) }).catch(() => {}); fetch("/api/halyard/shared").then((r) => r.json()).then((d) => setShared(d.sessions ?? [])).catch(() => {}); fetch("/api/halyard/sessions").then((r) => r.json()).then((d) => setRows(d.sessions ?? [])).catch(() => {}) }, [])
  useEffect(() => { const t = setTimeout(() => { fetch(`/api/halyard/library?q=${encodeURIComponent(q)}`).then((r) => r.json()).then((d) => setRows(d.sessions ?? [])).catch(() => {}) }, q ? 250 : 0); return () => clearTimeout(t) }, [q])
  const open = rows.find((r) => r.state === "live" || r.state === "paused")

  async function saveCfg(patch: Partial<{ retentionMonths: number; requireInformed: boolean }>) {
    setCfgMsg(null); const r = await fetch("/api/halyard/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }), d = await r.json().catch(() => ({}))
    if (r.ok) { setCfg((c) => (c ? { ...c, ...d } : c)); setCfgMsg("Saved.") } else setCfgMsg(d.error ?? "That could not be saved.")
  }
  async function start() {
    setBusy(true); setError(null)
    const r = await fetch("/api/halyard/sessions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, title, consentAttested: attested, participantsInformed: informed }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setError(d.error ?? "The session could not be started."); setBusy(false); return }
    router.push(`/dashboard/halyard/${d.session.id}`)
  }
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8 space-y-8">
      <header className="border-b border-border pb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Halyard · private to you</p>
        <h1 className="mt-3 text-3xl">A silent copilot for your live calls.</h1>
        <p className="mt-3 text-muted-foreground">It listens through your microphone, writes the conversation down, and suggests what to say. It only suggests: nothing is sent or changed on your behalf.</p>
      </header>
      {open && <p role="status" className="rounded-md border border-border p-4 text-sm">You have a session open. <Link className="underline" href={`/dashboard/halyard/${open.id}`}>Go back to it</Link>.</p>}
      <section aria-labelledby="start" className="space-y-4">
        <h2 id="start" className="text-xl">Start a session</h2>
        <div className="rounded-md border border-border p-4 text-sm space-y-2">
          <p><strong>What is heard, and where it goes.</strong> Your microphone is turned into short pieces of speech. Each piece is sent to a speech-to-text service chosen by your workspace's data policy, and the words are stored encrypted with your workspace. The audio is not kept.</p>
          <p>With one microphone, Halyard hears everyone it can hear, you included. It cannot tell the speakers apart. Use headphones if you want to keep the other side out of the microphone.</p>
        </div>
        {problem && <p role="alert" className="text-sm text-destructive">{problem}</p>}
        <label className="block text-sm">Call type<select className={field} value={mode} onChange={(e) => setMode(e.target.value)}>{MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}{custom.length > 0 && <optgroup label="Your playbooks">{custom.map((c) => <option key={c.mode} value={c.mode}>{c.label}{c.scope === "workspace" ? " (workspace)" : ""}</option>)}</optgroup>}</select><Link className="mt-1 inline-block text-xs underline" href="/dashboard/halyard/playbooks">Write your own call type</Link></label>
        <label className="block text-sm">Title (optional)<input className={field} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder="Call with …" /></label>
        <label className="flex gap-3 text-sm"><input type="checkbox" checked={attested} onChange={(e) => setAttested(e.target.checked)} className="mt-1" /><span>I have the permission I need to transcribe this conversation. In many countries and some US states that means everyone on the call has agreed.</span></label>
        <label className="flex gap-3 text-sm"><input type="checkbox" checked={informed} onChange={(e) => setInformed(e.target.checked)} className="mt-1" /><span>I have told the other participants it is being transcribed.{cfg?.requireInformed ? " (Your workspace requires this.)" : " (Recommended.)"}</span></label>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <button className="rounded-md bg-foreground px-4 py-2 text-sm text-background disabled:opacity-50" disabled={!attested || busy || !!problem || (!!cfg?.requireInformed && !informed)} onClick={start}>{busy ? "Starting…" : "Start session"}</button>
      </section>
      {cfg && <section aria-labelledby="gov" className="space-y-3 rounded-md border border-border p-4"><h2 id="gov" className="text-lg">Your data and your workspace's rules</h2>
        <p className="text-sm text-muted-foreground">Audio is never stored; only the words are, encrypted. Finished calls are deleted automatically {cfg.retentionMonths} month{cfg.retentionMonths === 1 ? "" : "s"} after they end, and you can delete one yourself at any time.</p>
        {cfg.canEdit ? <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm">Keep finished calls for (months)<input type="number" min={1} max={120} className={field} defaultValue={cfg.retentionMonths} onBlur={(e) => { const n = Number(e.target.value); if (n !== cfg.retentionMonths) void saveCfg({ retentionMonths: n }) }} /></label>
          <label className="flex gap-3 text-sm sm:pt-6"><input type="checkbox" className="mt-1" checked={cfg.requireInformed} onChange={(e) => saveCfg({ requireInformed: e.target.checked })} /><span>Require people to confirm they have told the other participants</span></label></div> : <p className="text-sm text-muted-foreground">Only a workspace owner or admin changes these.</p>}
        {cfgMsg && <p role="status" className="text-sm text-muted-foreground">{cfgMsg}</p>}
        <p className="text-sm"><a className="underline" href="/api/halyard/export">Download everything Halyard holds about your calls (JSON)</a></p></section>}
      {shared.length > 0 && <section aria-labelledby="shared" className="space-y-3"><h2 id="shared" className="text-xl">Shared with you</h2><ul className="divide-y divide-border rounded-md border border-border">{shared.map((r) => <li key={r.id} className="flex justify-between gap-4 p-3 text-sm"><Link className="underline" href={`/dashboard/halyard/${r.id}`}>{r.title || "Call"}</Link><span className="text-muted-foreground">from {r.ownerName} · {r.state === "live" || r.state === "paused" ? "live now" : new Date(r.startedAt).toLocaleDateString()}</span></li>)}</ul></section>}
      {(rows.length > 0 || q) && <section aria-labelledby="recent" className="space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><h2 id="recent" className="text-xl">Your calls</h2><label className="text-sm">Search<input className={field + " sm:w-64"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, summary or what was said" /></label></div>
        {rows.length === 0 && <p className="text-sm text-muted-foreground">No call matches that.</p>}
        <ul className="divide-y divide-border rounded-md border border-border">{rows.map((r) => <li key={r.id} className="flex justify-between gap-4 p-3 text-sm"><Link className="underline" href={`/dashboard/halyard/${r.id}`}>{r.title || MODES.find((m) => m[0] === r.mode)?.[1] || "Session"}</Link><span className="text-muted-foreground">{new Date(r.startedAt).toLocaleString()} · {r.state} · {Math.round(r.audioSeconds / 60)} min</span></li>)}</ul></section>}
    </div>
  )
}
