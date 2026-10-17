"use client"

import { useCallback, useEffect, useState } from "react"

interface Doc { id: string; title: string; filename: string; sizeBytes: number; sha256: string }
interface Pkg { current: { version: number; publishedAt: string | null; docs: Doc[] } | null; draft: { version: number; docs: Doc[] } | null }
const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

/** The fund's subscription package: add PDFs to a draft, publish it, and send it to each LP from the list below (docs/architecture/60 section 7). */
export function LpSubscriptionPackagePanel({ fundId }: { fundId: string }) {
  const [pkg, setPkg] = useState<Pkg | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const load = useCallback(async () => { const r = await fetch(`/api/portfolio/funds/${fundId}/subscription-package`, { cache: "no-store" }); if (r.ok) setPkg(await r.json()) }, [fundId])
  useEffect(() => { void load() }, [load])
  if (!pkg) return null
  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const form = e.currentTarget
    const r = await fetch(`/api/portfolio/funds/${fundId}/subscription-package`, { method: "POST", body: new FormData(form) })
    setMsg(r.ok ? "Added to the draft." : (await r.json().catch(() => ({}))).error ?? "Could not add the file.")
    if (r.ok) form.reset()
    setBusy(false); await load()
  }
  async function remove(id: string) { setBusy(true); await fetch(`/api/portfolio/funds/${fundId}/subscription-package`, { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ docId: id }) }); setBusy(false); await load() }
  async function publish() {
    if (!confirm("Publish this draft as the current subscription package? Investors who were already sent the previous version keep it; new sends use this one.")) return
    setBusy(true); setMsg(null)
    const r = await fetch(`/api/portfolio/funds/${fundId}/subscription-package`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "publish" }) })
    const j = await r.json().catch(() => ({}))
    setMsg(r.ok ? `Published as version ${j.version}.` : j.error ?? "Could not publish.")
    setBusy(false); await load()
  }
  const dl = (d: Doc) => <a className="underline" href={`/api/portfolio/subscription-files/${d.id}`}>{d.title}</a>
  const small = "h-8 rounded-md border px-3 text-xs disabled:opacity-50"
  return (
    <div className="border-b border-foreground/10 px-4 py-4 text-sm" aria-labelledby="sub-pk-h">
      <h3 id="sub-pk-h" className="font-medium">Subscription package</h3>
      <p className="mt-1 text-xs text-muted-foreground">The documents an investor reads, signs and returns (subscription agreement, side letter, forms). Only PDFs up to 4 MB. Publish a draft to make it the package you send.</p>
      {pkg.current ? <p className="mt-2">Current: version {pkg.current.version}, {pkg.current.docs.length} document(s): {pkg.current.docs.map((d, i) => <span key={d.id}>{i ? ", " : ""}{dl(d)}</span>)}</p> : <p className="mt-2 text-muted-foreground">No package published yet.</p>}
      <div className="mt-2">
        <p className="text-xs font-medium">Draft{pkg.draft ? ` (version ${pkg.draft.version})` : ""}</p>
        {pkg.draft && pkg.draft.docs.length > 0 && <ul className="mt-1 space-y-1">{pkg.draft.docs.map((d) => <li key={d.id}>{dl(d)} <span className="text-xs text-muted-foreground">{kb(d.sizeBytes)}</span> <button className="ml-2 text-xs underline" disabled={busy} onClick={() => remove(d.id)}>Remove</button></li>)}</ul>}
        <form onSubmit={upload} className="mt-2 flex flex-wrap items-center gap-2">
          <input name="title" placeholder="name shown to investors" aria-label="Document name" className="h-8 w-52 rounded-md border bg-transparent px-2 text-xs" />
          <input type="file" name="file" accept="application/pdf,.pdf" required aria-label="PDF file" className="text-xs" />
          <button className={small} disabled={busy}>Add to draft</button>
          {pkg.draft && pkg.draft.docs.length > 0 && <button type="button" className={small} disabled={busy} onClick={publish}>Publish draft</button>}
        </form>
      </div>
      {msg && <p role="status" className="mt-2 text-xs">{msg}</p>}
    </div>
  )
}
