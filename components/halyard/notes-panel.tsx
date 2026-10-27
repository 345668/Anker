"use client"
import { useEffect, useState } from "react"

type Body = { summary: string; keyPoints: string[]; decisions: string[]; actionItems: string[]; followUp: string[]; figures: Array<{ value: string; context: string; who: string }>; email: string }
export type NotesRecord = { version: number; by: "user" | "ai"; body: Body } | null
const EMPTY: Body = { summary: "", keyPoints: [], decisions: [], actionItems: [], followUp: [], figures: [], email: "" }
const SECTIONS: Array<[keyof Body, string]> = [["keyPoints", "Key points"], ["decisions", "Decisions"], ["actionItems", "Action items"], ["followUp", "Follow-up"]]
const field = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
const btn = "rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
const lines = (xs: string[]) => xs.join("\n")
const unlines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean)

/** Live and finished notes (docs/architecture/62 section 9): editable, saved as versions; an AI draft never overwrites an edit, it is shown beside it. */
export function NotesPanel({ id, initial, canDraft, ended = false, readOnly = false }: { id: string; initial: NotesRecord; canDraft: boolean; ended?: boolean; readOnly?: boolean }) {
  const [rec, setRec] = useState<NotesRecord>(initial), [body, setBody] = useState<Body>(initial?.body ?? EMPTY), [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState<string | null>(null), [msg, setMsg] = useState<string | null>(null), [draft, setDraft] = useState<Body | null>(null)
  useEffect(() => { setRec(initial); if (!dirty) setBody(initial?.body ?? EMPTY) }, [initial]) // eslint-disable-line react-hooks/exhaustive-deps
  const edit = (patch: Partial<Body>) => { setBody((b) => ({ ...b, ...patch })); setDirty(true) }

  async function call(path: string, init: RequestInit, label: string) {
    setBusy(label); setMsg(null)
    try { const r = await fetch(`/api/halyard/sessions/${id}/${path}`, { headers: { "Content-Type": "application/json" }, ...init }), d = await r.json().catch(() => ({})); if (!r.ok) { setMsg(d.error ?? "That did not work."); return null } return d } catch { setMsg("The connection dropped. Try again."); return null } finally { setBusy(null) }
  }
  async function save() { const d = await call("notes", { method: "PUT", body: JSON.stringify(body) }, "save"); if (d) { setRec(d.notes); setBody(d.notes.body); setDirty(false); setDraft(null); setMsg("Saved.") } }
  async function aiDraft() {
    const d = await call("notes/draft", { method: "POST" }, "draft"); if (!d) return
    if (d.saved) { setRec(d.notes); setBody(d.notes.body); setDirty(false); setDraft(null); setMsg("Drafted from the whole transcript. Check it before you rely on it.") }
    else { setDraft(d.draft); setMsg("You have edited these notes, so they were kept. The AI draft is shown below to compare.") }
  }
  async function email() { if (dirty) await save(); const d = await call("notes/email", { method: "POST" }, "email"); if (d) { setRec(d.notes); setBody((b) => ({ ...b, email: d.notes.body.email })); setMsg("Email drafted from the notes. Nothing was sent.") } }

  async function propose() { const d = await call("notes/email/propose", { method: "POST" }, "propose"); if (d) setMsg(d.alreadyPending ? "This is already waiting for you in the actions inbox." : "Proposed. Approve it in the actions inbox to save it as a draft; nothing is sent.") }

  return (
    <section aria-labelledby="notes-h" className="space-y-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 id="notes-h" className="text-lg">Notes</h2>
        {!readOnly && <div className="flex flex-wrap gap-2">
          <button className={btn} disabled={!!busy || !canDraft} onClick={aiDraft}>{busy === "draft" ? "Drafting…" : "Draft with AI"}</button>
          <button className={btn} disabled={!!busy || !dirty} onClick={save}>{busy === "save" ? "Saving…" : dirty ? "Save changes" : "Saved"}</button></div>}</div>
      {msg && <p role="status" className="text-sm text-muted-foreground">{msg}</p>}
      <label className="block text-sm">Summary<textarea className={field} readOnly={readOnly} rows={3} value={body.summary} onChange={(e) => edit({ summary: e.target.value })} /></label>
      <div className="grid gap-3 sm:grid-cols-2">{SECTIONS.map(([k, l]) => <label key={k} className="block text-sm">{l} <span className="text-xs text-muted-foreground">(one per line)</span><textarea className={field} readOnly={readOnly} rows={4} value={lines(body[k] as string[])} onChange={(e) => edit({ [k]: unlines(e.target.value) } as any)} /></label>)}</div>
      {body.figures.length > 0 && <div className="text-sm"><h3 className="font-medium">Figures said on the call</h3><ul className="mt-1 space-y-1">{body.figures.map((f, i) => <li key={i}><strong>{f.value}</strong>{f.who ? <span className="text-muted-foreground"> ({f.who})</span> : null}: <span className="text-muted-foreground">{f.context}</span></li>)}</ul></div>}
      {draft && <div className="rounded-md border border-border bg-muted p-3 text-sm space-y-2"><h3 className="font-medium">AI draft (not saved)</h3><p>{draft.summary}</p>{SECTIONS.map(([k, l]) => (draft[k] as string[]).length ? <div key={k}><p className="font-medium">{l}</p><ul className="list-disc pl-5">{(draft[k] as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div> : null)}
        <div className="flex gap-2"><button className={btn} onClick={() => { setBody((b) => ({ ...draft, email: b.email })); setDirty(true); setDraft(null) }}>Use this draft</button><button className={btn} onClick={() => setDraft(null)}>Keep mine</button></div></div>}
      {!readOnly && <div className="space-y-2 border-t border-border pt-3"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-medium">Follow-up email (draft)</h3><div className="flex flex-wrap gap-2"><button className={btn} disabled={!!busy || !canDraft} onClick={email}>{busy === "email" ? "Drafting…" : "Draft email from notes"}</button>{ended && <button className={btn} disabled={!!busy || !body.email.trim() || dirty} onClick={propose} title="Adds a proposal to your actions inbox. Nothing is saved or sent until you approve it.">{busy === "propose" ? "Proposing…" : "Propose saving as a draft"}</button>}</div></div>
        <textarea className={field} rows={6} value={body.email} onChange={(e) => edit({ email: e.target.value })} placeholder="Nothing yet. A draft is written from your notes; sending is always your own act." aria-label="Follow-up email draft" /></div>}
      <div className="flex flex-wrap gap-3 text-sm"><a className="underline" href={`/api/halyard/sessions/${id}/export?format=md`}>Export Markdown</a><a className="underline" href={`/api/halyard/sessions/${id}/export?format=docx`}>Export Word</a><a className="underline" href={`/api/halyard/sessions/${id}/export?format=pdf`}>Export PDF</a>{!readOnly && <a className="underline" href={`/api/halyard/sessions/${id}/export?format=md&suggestions=1`}>Markdown with suggestions</a>}</div>
      {rec && <p className="text-xs text-muted-foreground">Version {rec.version}, {rec.by === "ai" ? "drafted by AI" : readOnly ? "edited by the owner" : "edited by you"}.</p>}
    </section>
  )
}
