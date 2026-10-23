"use client"
import { useCallback, useEffect, useState } from "react"
import { TEXTS } from "@/lib/investor/legal"
import { call, btn, btnGhost } from "./api"

/** The entity's verification passport: documents kept once, shared as a copy with one fund at a time. */
export function Passport({ entityId }: { entityId: string }) {
  const base = `/api/investor/entities/${entityId}/passport`
  const [p, setP] = useState<any>(null), [err, setErr] = useState<string | null>(null), [msg, setMsg] = useState<string | null>(null), [pick, setPick] = useState<Record<string, string[]>>({}), [busy, setBusy] = useState(false)
  const load = useCallback(() => call(base).then(setP).catch((e) => setErr(e.message)), [base])
  useEffect(() => { void load() }, [load])
  if (!p) return err ? <p role="alert" className="text-sm text-red-600">{err}</p> : null
  if (!p.open && p.wanted.every((w: any) => !w.doc)) return null                                  // closed and nothing stored: say nothing
  async function upload(type: string, file: File | undefined) {
    if (!file) return
    setBusy(true); setErr(null); setMsg(null)
    const f = new FormData(); f.set("docType", type); f.set("file", file)
    try { const r = await fetch(base, { method: "POST", body: f, credentials: "same-origin" }); const d = await r.json().catch(() => null); if (!r.ok) throw new Error(d?.error || "The upload failed."); await load() } catch (x) { setErr(x instanceof Error ? x.message : "Try again.") } finally { setBusy(false) }
  }
  const act = (url: string, init?: { method?: string; body?: unknown }, ok?: (r: any) => string) => call(url, init).then((r) => { if (ok) setMsg(ok(r)); return load() }).catch((e) => setErr(e.message))
  const toggle = (rel: string, t: string) => setPick({ ...pick, [rel]: (pick[rel] ?? []).includes(t) ? (pick[rel] ?? []).filter((x) => x !== t) : [...(pick[rel] ?? []), t] })
  return <section className="space-y-4"><h2 className="text-lg font-semibold">Verification passport</h2>
    <p className="text-sm text-muted-foreground">{TEXTS.passportIntro.text}</p>
    {!p.open && <p className="text-sm">{TEXTS.passportClosed.text}</p>}
    {err && <p role="alert" className="text-sm text-red-600">{err}</p>}{msg && <p role="status" className="text-sm">{msg}</p>}
    <ul className="space-y-3">{p.wanted.map((w: any) => <li key={w.type} className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{w.label}</span>
        {p.canEdit && p.open && <label className={`${btnGhost} cursor-pointer`}>{w.doc ? "Replace" : "Add"}<input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png" disabled={busy} onChange={(e) => { void upload(w.type, e.target.files?.[0]); e.target.value = "" }} /></label>}</div>
      {w.doc ? <div className="mt-1 space-y-1"><p className="text-muted-foreground">{w.doc.filename} · {Math.round(w.doc.sizeBytes / 1024)} KB · added {new Date(w.doc.addedAt).toLocaleDateString()}</p>
        {w.doc.shares.map((s: any) => <p key={s.id} className="text-xs">{s.revokedAt ? (s.retained ? `Shared with ${s.fundName}; taken back, but the fund had already checked it and keeps it for its records. Ask the fund to remove it.` : `Shared with ${s.fundName}; taken back.`) : `Shared with ${s.fundName} on ${new Date(s.sharedAt).toLocaleDateString()}.`}
          {!s.revokedAt && p.canEdit && <> <button className="underline" onClick={() => act(`${base}/revoke`, { method: "POST", body: { shareId: s.id } }, (r) => r.outcome === "deleted" ? TEXTS.passportTakenDeleted.text : r.outcome === "retained" ? TEXTS.passportTakenRetained.text : TEXTS.passportTakenReplaced.text)}>Take back</button></>}</p>)}
        {p.canEdit && <p className="flex gap-3 text-xs"><a className="underline" href={`${base}/file?docId=${w.doc.id}`}>Download my copy</a><button className="underline" onClick={() => confirm(TEXTS.passportRemoveConfirm.text) && act(`${base}?docId=${w.doc.id}`, { method: "DELETE" })}>Remove</button></p>}</div> : <p className="mt-1 text-muted-foreground">Not added yet.</p>}</li>)}</ul>
    {p.canEdit && p.open && p.funds.length > 0 && <div className="space-y-3"><h3 className="font-medium">Share with a fund that is onboarding you</h3>
      <p className="text-xs text-muted-foreground">{TEXTS.passportShareConsent.text}</p>
      {p.funds.map((f: any) => <div key={f.relationshipId} className="rounded-lg border p-3 text-sm"><p className="font-medium">{f.fundName}</p>
        <p className="text-muted-foreground">{f.wants.length ? "Still needed by the fund: " + f.wants.map((t: string) => t.replace(/_/g, " ")).join(", ") : "The fund has what it asked for, or has not started its checklist yet."}</p>
        <div className="mt-1 flex flex-wrap gap-3">{p.wanted.filter((w: any) => w.doc).map((w: any) => <label key={w.type} className="inline-flex items-center gap-1.5"><input type="checkbox" checked={(pick[f.relationshipId] ?? []).includes(w.type)} onChange={() => toggle(f.relationshipId, w.type)} />{w.label}</label>)}</div>
        <button className={`${btn} mt-2`} disabled={!(pick[f.relationshipId] ?? []).length} onClick={() => act(`${base}/share`, { method: "POST", body: { relationshipId: f.relationshipId, docTypes: pick[f.relationshipId] } }, (r) => `Shared: ${r.shared.length ? r.shared.join(", ").replace(/_/g, " ") : "nothing"}.${r.skipped.length ? " Skipped: " + r.skipped.map((s: any) => `${s.type.replace(/_/g, " ")} (${s.why})`).join("; ") : ""}`)}>Share a copy with {f.fundName}</button></div>)}</div>}
  </section>
}
