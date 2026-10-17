"use client"

import { useCallback, useEffect, useState } from "react"

interface Doc { id: string; title: string; category: string; filename: string; sizeBytes: number; at: string; forAll: boolean; lpId: string | null }
const CAT: Record<string, string> = { tax: "Tax document", annual_statement: "Annual statement", notice: "Notice", other: "Other" }

/** Documents the fund publishes to its investors: to all of them, or to one (docs/architecture/60 section 8). Telling them is a separate, deliberate click per investor in the list below. */
export function LpDocumentsPanel({ fundId, lps }: { fundId: string; lps: Array<{ id: string; name: string }> }) {
  const [docs, setDocs] = useState<Doc[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => { const r = await fetch(`/api/portfolio/funds/${fundId}/lp-documents`, { cache: "no-store" }); if (r.ok) setDocs((await r.json()).documents) }, [fundId])
  useEffect(() => { void load() }, [load])
  if (!docs) return null
  async function publish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const form = e.currentTarget
    const r = await fetch(`/api/portfolio/funds/${fundId}/lp-documents`, { method: "POST", body: new FormData(form) })
    setMsg(r.ok ? "Published. Investors see it the next time they open their portal." : (await r.json().catch(() => ({}))).error ?? "Could not publish.")
    if (r.ok) form.reset()
    setBusy(false); await load()
  }
  async function remove(id: string) { if (!confirm("Take this document down? Investors will no longer see it.")) return; await fetch(`/api/portfolio/funds/${fundId}/lp-documents`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ docId: id }) }); await load() }
  const name = (id: string | null) => lps.find((l) => l.id === id)?.name ?? "one investor"
  const small = "h-8 rounded-md border px-3 text-xs disabled:opacity-50"
  return (
    <div className="border-b border-foreground/10 px-4 py-4 text-sm" aria-labelledby="lp-docs-h">
      <h3 id="lp-docs-h" className="font-medium">Documents for investors</h3>
      <p className="mt-1 text-xs text-muted-foreground">Tax documents, annual statements and notices as PDFs (up to 4 MB). Publish to every investor of the fund, or to one.</p>
      {docs.length > 0 && <ul className="mt-2 space-y-1">{docs.slice(0, 12).map((d) => <li key={d.id}><a className="underline" href={`/api/portfolio/lp-documents/${d.id}`}>{d.title}</a> <span className="text-xs text-muted-foreground">· {CAT[d.category] ?? d.category} · {d.forAll ? "all investors" : name(d.lpId)} · {d.at}</span> <button className="ml-1 text-xs underline" onClick={() => remove(d.id)}>Take down</button></li>)}</ul>}
      <form onSubmit={publish} className="mt-2 flex flex-wrap items-center gap-2">
        <input name="title" required placeholder="name investors see" aria-label="Document name" className="h-8 w-48 rounded-md border bg-transparent px-2 text-xs" />
        <select name="category" required defaultValue="" aria-label="Kind of document" className="h-8 rounded-md border bg-transparent px-2 text-xs"><option value="" disabled>Kind…</option>{Object.entries(CAT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="lpId" defaultValue="" aria-label="Who gets it" className="h-8 rounded-md border bg-transparent px-2 text-xs"><option value="">All investors</option>{lps.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select>
        <input type="file" name="file" accept="application/pdf,.pdf" required aria-label="PDF file" className="text-xs" />
        <button className={small} disabled={busy}>Publish</button>
      </form>
      {msg && <p role="status" className="mt-2 text-xs">{msg}</p>}
    </div>
  )
}
