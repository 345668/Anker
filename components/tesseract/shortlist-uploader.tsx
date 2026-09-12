"use client"
import { useRef, useState } from "react"
import Link from "next/link"
import { Upload, Loader2 } from "lucide-react"

type Preview = { selected: number; excluded: number; duplicateCopies: number; mode: string; rows: {key: string; name: string; stage: string}[] }
export function ShortlistUploader({ source = "lp_matching", sessionId = null, compact = false, className = "" }: {
  source?: string; sessionId?: string | null; compact?: boolean; className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  async function upload(chosen: File, inspect: boolean) {
    setBusy(true); setError(""); setMessage("")
    try {
      const form = new FormData(); form.set("xlsx", chosen); form.set("source", source)
      if (sessionId) form.set("session_id", sessionId)
      if (inspect) form.set("preview", "true")
      const res = await fetch("/api/crm/import-shortlist", { method: "POST", body: form })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Import failed. Try again.")
      if (inspect) { setFile(chosen); setPreview(data) }
      else { setPreview(null); setFile(null); setMessage(`${data.totalInserted} added; ${data.alreadyPresent} already in CRM; ${data.missing ?? 0} no longer in the directory. Existing entries keep their board and edits.`) }
    } catch (e) { setError(e instanceof Error ? e.message : "Import failed.") }
    finally { setBusy(false); if (input.current) input.current.value = "" }
  }
  return <div className={`${compact ? "" : "rounded-xl border p-5"} ${className}`} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f && !busy) { setPreview(null); void upload(f, true) } }}>
    {!compact && <><h3 className="font-medium">Import your investor shortlist</h3><p className="my-2 text-sm text-muted-foreground">Edit TRUE/FALSE on the Import Selection sheet, then upload or drop your XLSX. For older workbooks, a FALSE on any sheet excludes that investor.</p></>}
    <input ref={input} aria-label="Choose investor shortlist XLSX" type="file" accept=".xlsx" className="sr-only" disabled={busy} onChange={e => { const f = e.target.files?.[0]; if (f) { setPreview(null); void upload(f, true) } }} />
    <button type="button" disabled={busy} onClick={() => input.current?.click()} className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm disabled:opacity-50">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {busy ? "Processing…" : "Upload XLSX"}</button>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {preview && <section className="mt-4 space-y-3 text-sm" aria-label="Review shortlist import">
      <p>{preview.selected} selected, {preview.excluded} excluded. {preview.duplicateCopies} repeated worksheet rows consolidated.</p>
      <ul className="max-h-64 overflow-y-auto divide-y">{preview.rows.map(r => <li key={r.key} className="py-2">{r.name || r.key} <span className="text-muted-foreground">({r.stage})</span></li>)}</ul>
      <p className="text-muted-foreground">Existing investors retain their original CRM board and edits.</p>
      <button type="button" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy || !preview.selected} onClick={() => file && void upload(file, false)}>Import {preview.selected} selected investors</button>
      <button type="button" disabled={busy} onClick={() => { setPreview(null); setFile(null) }} className="ml-3 underline">Cancel</button>
    </section>}
    {message && <p role="status" className="mt-3 text-sm">{message} <Link href="/dashboard/crm" className="underline">Open CRM</Link></p>}
  </div>
}
