"use client"
import { useCallback, useEffect, useState } from "react"
import Link from "next/link"

type PB = { id: string; scope: "personal" | "workspace"; slug: string; label: string; updatedAt: string; authorId: string }
type Info = { builtIn: Array<{ mode: string; label: string; description: string }>; playbooks: PB[]; canWriteWorkspace: boolean; canWrite: boolean; limits: { workspace: number; personal: number } }
type Preview = { ok: boolean; errors: string[]; label: string | null; description: string | null; sections: string[]; chars: number; hasNotesGuide: boolean; hasEmailGuide: boolean }
const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
const btn = "rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"

/** Write your own call mode, in the same file format as the built-in ones (docs/architecture/77). The parser's own messages are shown as they are. */
export function PlaybookEditor() {
  const [info, setInfo] = useState<Info | null>(null), [editing, setEditing] = useState<string | null>(null), [text, setText] = useState(""), [scope, setScope] = useState<"personal" | "workspace">("personal")
  const [prev, setPrev] = useState<Preview | null>(null), [msg, setMsg] = useState<string | null>(null), [busy, setBusy] = useState(false)
  const load = useCallback(async () => { const r = await fetch("/api/halyard/playbooks"); if (r.ok) setInfo(await r.json()) }, [])
  useEffect(() => { void load() }, [load])
  useEffect(() => { if (!text.trim()) { setPrev(null); return } const t = setTimeout(async () => { const r = await fetch("/api/halyard/playbooks/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }); if (r.ok) setPrev(await r.json()) }, 350); return () => clearTimeout(t) }, [text])

  async function start(from?: string) { setMsg(null); setEditing("new"); const r = await fetch(`/api/halyard/playbooks/template${from ? `?from=${encodeURIComponent(from)}` : ""}`); const d = await r.json().catch(() => ({})); setText(d.text ?? "") }
  async function open(id: string) { setMsg(null); const r = await fetch(`/api/halyard/playbooks/${id}`), d = await r.json().catch(() => ({})); if (r.ok) { setEditing(id); setText(d.text); setScope(d.playbook.scope) } else setMsg(d.error ?? "It could not be opened.") }
  async function save() {
    setBusy(true); setMsg(null)
    const r = await fetch(editing === "new" ? "/api/halyard/playbooks" : `/api/halyard/playbooks/${editing}`, { method: editing === "new" ? "POST" : "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope, text }) }), d = await r.json().catch(() => ({}))
    setBusy(false); if (!r.ok) { setMsg(d.error ?? "It could not be saved."); return }
    setMsg("Saved. It is now in the call type list."); setEditing(d.playbook.id); await load()
  }
  async function remove() { if (!editing || editing === "new" || !confirm("Delete this playbook? Sessions already started with it carry on in the general mode.")) return; const r = await fetch(`/api/halyard/playbooks/${editing}`, { method: "DELETE" }); if (r.ok) { setEditing(null); setText(""); setMsg("Deleted."); await load() } else setMsg((await r.json().catch(() => ({}))).error ?? "It could not be deleted.") }
  const mine = (p: PB) => p.scope === "personal" || info?.canWriteWorkspace

  if (!info) return <p role="status" className="p-8">Loading…</p>
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8 sm:px-8">
      <header className="border-b border-border pb-5"><p className="text-xs uppercase tracking-widest text-muted-foreground"><Link href="/dashboard/halyard" className="underline">Halyard</Link> · playbooks</p><h1 className="mt-2 text-3xl">Your own call types</h1>
        <p className="mt-2 text-muted-foreground">A playbook tells Halyard how to help in a particular kind of call: who is who, what a good answer sounds like, what the notes should capture. It is a plain text file in the same format as the built-in ones. It only shapes suggestions; it cannot change what is spoken-only, the length limits, or give the assistant any power to act.</p></header>
      {msg && <p role="status" className="rounded-md border border-border p-3 text-sm">{msg}</p>}
      <section aria-labelledby="mine" className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-2"><h2 id="mine" className="text-xl">Playbooks</h2>
        {info.canWrite && <div className="flex flex-wrap gap-2"><button className={btn} onClick={() => start()}>New from a template</button>
          <select className={btn} aria-label="Start from a built-in call type" value="" onChange={(e) => e.target.value && start(e.target.value)}><option value="">Start from a built-in…</option>{info.builtIn.map((b) => <option key={b.mode} value={b.mode}>{b.label}</option>)}</select></div>}</div>
        {info.playbooks.length === 0 ? <p className="text-sm text-muted-foreground">None yet. Built-in call types are always available.</p> : <ul className="divide-y divide-border rounded-md border border-border">{info.playbooks.map((p) => <li key={p.id} className="flex items-center justify-between gap-3 p-3 text-sm"><span><strong>{p.label}</strong> <span className="text-muted-foreground">· {p.scope === "workspace" ? "whole workspace" : "only you"} · updated {new Date(p.updatedAt).toLocaleDateString()}</span></span><button className={btn} onClick={() => open(p.id)}>{mine(p) ? "Edit" : "View"}</button></li>)}</ul>}</section>
      {editing && <section aria-labelledby="ed" className="space-y-3"><h2 id="ed" className="text-xl">{editing === "new" ? "New playbook" : "Edit playbook"}</h2>
        {editing === "new" && info.canWriteWorkspace && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={scope === "workspace"} onChange={(e) => setScope(e.target.checked ? "workspace" : "personal")} />Share with the whole workspace (everyone can use it; owners and admins edit it)</label>}
        <textarea className={field + " font-mono"} rows={24} value={text} onChange={(e) => setText(e.target.value)} aria-label="Playbook text" spellCheck={false} readOnly={editing !== "new" && !info.playbooks.find((p) => p.id === editing && mine(p))} />
        {prev && <div className="rounded-md border border-border p-3 text-sm" aria-live="polite">{prev.ok ? <><p><strong>{prev.label}</strong> · {prev.chars.toLocaleString("en")} characters · sections for: {prev.sections.join(", ") || "none yet"}</p><p className="text-muted-foreground">{prev.description}</p>{!prev.hasNotesGuide && <p className="text-muted-foreground">No "Action: notes" section, so notes use the general guidance.</p>}{!prev.hasEmailGuide && <p className="text-muted-foreground">No "Action: email" section, so the follow-up email uses the general guidance.</p>}</> : <><p className="font-medium text-destructive">Not valid yet:</p><ul className="list-disc pl-5">{prev.errors.map((e) => <li key={e}>{e}</li>)}</ul></>}</div>}
        <div className="flex flex-wrap gap-2"><button className={btn} disabled={busy || !prev?.ok} onClick={save}>{busy ? "Saving…" : "Save playbook"}</button>{editing !== "new" && <button className={btn} onClick={remove}>Delete</button>}<button className={btn} onClick={() => { setEditing(null); setText(""); setPrev(null) }}>Close</button></div></section>}
    </div>
  )
}
