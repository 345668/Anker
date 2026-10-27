"use client"
import { useEffect, useState } from "react"

type P = { userId: string; name: string; email: string }
/** Share a finished call with colleagues in the workspace (docs/architecture/62 section 13). Explicit, per person, withdrawable; they can read the call and the notes, nothing else. */
export function SharePanel({ id }: { id: string }) {
  const [members, setMembers] = useState<P[]>([]), [shared, setShared] = useState<P[]>([]), [busy, setBusy] = useState<string | null>(null), [msg, setMsg] = useState<string | null>(null), [open, setOpen] = useState(false)
  useEffect(() => { if (!open) return; fetch(`/api/halyard/sessions/${id}/share`).then((r) => r.json()).then((d) => { setMembers(d.members ?? []); setShared(d.shared ?? []) }).catch(() => setMsg("The list could not be loaded.")) }, [id, open])
  const on = (u: string) => shared.some((s) => s.userId === u)
  async function toggle(u: string) {
    setBusy(u); setMsg(null)
    const r = await fetch(`/api/halyard/sessions/${id}/share`, { method: on(u) ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: u }) }), d = await r.json().catch(() => ({}))
    if (r.ok) setShared(d.shared ?? []); else setMsg(d.error ?? "That did not work."); setBusy(null)
  }
  return (
    <section aria-labelledby="share-h" className="rounded-md border border-border p-4 space-y-2">
      <div className="flex items-center justify-between gap-2"><h2 id="share-h" className="text-lg">Share this call</h2><button className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? "Close" : shared.length ? `Shared with ${shared.length}` : "Choose colleagues"}</button></div>
      {open && <>
        <p className="text-xs text-muted-foreground">They can read the transcript, the summary and the notes. They cannot see your suggestions or your email draft, and they cannot change anything. You can stop sharing at any time.</p>
        {msg && <p role="alert" className="text-sm text-destructive">{msg}</p>}
        {members.length === 0 ? <p className="text-sm text-muted-foreground">There is nobody else in this workspace yet.</p> : <ul className="divide-y divide-border rounded-md border border-border">{members.map((m) => <li key={m.userId} className="flex items-center justify-between gap-3 p-2 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={on(m.userId)} disabled={busy === m.userId} onChange={() => toggle(m.userId)} /><span>{m.name}{m.email && m.email !== m.name ? <span className="text-muted-foreground"> · {m.email}</span> : null}</span></label></li>)}</ul>}
      </>}
    </section>
  )
}
