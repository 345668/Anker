"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

interface Props {
  deck: any
  template: any
  funds: Array<{ id: string; name: string }>
}

export function DeckDetail({ deck: initial, template, funds }: Props) {
  const router = useRouter()
  const [deck, setDeck] = useState(initial)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [workspaceUrl, setWorkspaceUrl] = useState(deck.workspaceFileUrl || "")

  async function patch(body: any) {
    setMsg(null)
    const r = await fetch(`/api/decks/${deck.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    if (!r.ok) setMsg("Save failed")
  }
  async function setFund(fundId: string) {
    setDeck({ ...deck, fundId })
    await patch({ fundId })
  }
  async function saveWorkspaceUrl() {
    const key = extractKey(workspaceUrl)
    if (!key) { setMsg("URL must be a figma.com/file/<key>/... URL."); return }
    setDeck({ ...deck, workspaceFileKey: key, workspaceFileUrl: workspaceUrl })
    await patch({ workspaceFileKey: key, workspaceFileUrl: workspaceUrl })
    setMsg("Saved. Open the plugin in this file and hit Fill from Anker.")
  }
  async function generate() {
    if (!deck.fundId) { setMsg("Pick a fund first."); return }
    setGenerating(true); setMsg("Generating…")
    try {
      const r = await fetch(`/api/decks/${deck.id}/generate`, { method: "POST" })
      const j = await r.json()
      if (!r.ok) setMsg(j?.error || "Generate failed")
      else { setMsg(`Generated ${j.generated} field(s).`); router.refresh() }
    } finally { setGenerating(false) }
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 space-y-6">
      <header>
        <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Deck</div>
        <h1 className="mt-1 text-2xl font-semibold">{template?.name || `Template ${template?.file_key?.slice(-6)}`}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Type: {template?.deck_type} · Status: {deck.status}</p>
      </header>

      <section className="rounded-xl border border-foreground/10 bg-background p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">1 · Fund</h2>
        <select value={deck.fundId ?? ""} onChange={(e) => setFund(e.target.value)}
          className="w-full rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm">
          <option value="">Select a fund…</option>
          {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </section>

      <section className="rounded-xl border border-foreground/10 bg-background p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">2 · Duplicate the template to your workspace</h2>
        <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Open the community template on Figma → <a href={`https://www.figma.com/community/file/${template?.file_key}`} target="_blank" rel="noopener noreferrer" className="text-primary underline">preview</a>.</li>
          <li>Click <b>Use template</b>. Figma creates a copy in your workspace.</li>
          <li>Copy the new file URL from the address bar and paste below.</li>
        </ol>
        <div className="flex gap-2">
          <input value={workspaceUrl} onChange={(e) => setWorkspaceUrl(e.target.value)}
            placeholder="https://www.figma.com/file/XXXXXX/…"
            className="flex-1 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm" />
          <button onClick={saveWorkspaceUrl}
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background">Save</button>
        </div>
        {deck.workspaceFileKey && (
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs text-emerald-800">
            ✓ Workspace file linked: <code>{deck.workspaceFileKey}</code>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-foreground/10 bg-background p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">3 · Generate copy</h2>
        <p className="text-sm text-muted-foreground">Qwen fills every narrative slot in the template's approved mapping, respecting the original character budgets.</p>
        <button onClick={generate} disabled={generating || !deck.fundId}
          className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-60">
          {generating ? "Generating…" : "Generate copy with Qwen"}
        </button>
        {deck.lastFilledAt && (
          <p className="text-xs text-muted-foreground">Last generated {new Date(deck.lastFilledAt).toLocaleString()}</p>
        )}
      </section>

      <section className="rounded-xl border border-foreground/10 bg-background p-5 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">4 · Send to Figma</h2>
        <ol className="ml-5 list-decimal space-y-1 text-sm text-muted-foreground">
          <li>Open your workspace copy in Figma.</li>
          <li>Plugins → Anker Decks → Fill from Anker.</li>
          <li>Paste deck id: <code className="rounded bg-foreground/5 px-1.5 py-0.5">{deck.id}</code></li>
          <li>Hit <b>Apply</b>.</li>
        </ol>
      </section>

      {msg && <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900">{msg}</div>}
    </div>
  )
}

function extractKey(url: string): string | null {
  const m = url.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/)
  return m ? m[1] : null
}
