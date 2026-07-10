"use client"

/**
 * DeckDetail — a single deck's workroom, powerhouse edition.
 *
 *   - Status stepper: draft → mapping → filled → exported (click to set)
 *   - Steps: fund context → duplicate template → generate copy → REVIEW &
 *     EDIT every field (new) → send to Figma
 *   - Content editor: every mapped slot from the template's node_mapping,
 *     prefilled from user edits (deck.values) > AI copy > the template's
 *     original text. Edits save to deck.values, which WIN in the plugin
 *     payload, so what you approve here is exactly what lands in Figma.
 */

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft, Check, Loader2, Sparkles, ExternalLink, Save, Figma, Archive,
} from "lucide-react"

interface MappingEntry {
  nodeId: string
  kind: "field" | "value" | "skip"
  field?: string
  note?: string
  originalText?: string
  budget?: number
  slide?: number
}

interface Props {
  deck: any
  template: any
  funds: Array<{ id: string; name: string }>
}

const STATUSES = ["draft", "mapping", "filled", "exported"] as const

export function DeckDetail({ deck: initial, template, funds }: Props) {
  const router = useRouter()
  const [deck, setDeck] = useState(initial)
  const [generating, setGenerating] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [workspaceUrl, setWorkspaceUrl] = useState(deck.workspaceFileUrl || "")
  const [values, setValues] = useState<Record<string, string>>(deck.values ?? {})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)

  const entries: MappingEntry[] = useMemo(() => {
    const raw = template?.node_mapping?.entries
    return Array.isArray(raw) ? raw.filter((e: MappingEntry) => e.kind !== "skip") : []
  }, [template])

  async function patch(body: any) {
    setMsg(null)
    const r = await fetch(`/api/decks/${deck.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    })
    if (!r.ok) setMsg("Save failed")
    return r.ok
  }

  async function setFund(fundId: string) {
    setDeck({ ...deck, fundId })
    await patch({ fundId })
  }

  async function setStatus(status: string) {
    setDeck({ ...deck, status })
    await patch({ status })
  }

  async function saveWorkspaceUrl() {
    const key = extractKey(workspaceUrl)
    if (!key) { setMsg("URL must be a figma.com/file/<key>/… URL."); return }
    setDeck({ ...deck, workspaceFileKey: key, workspaceFileUrl: workspaceUrl })
    await patch({ workspaceFileKey: key, workspaceFileUrl: workspaceUrl })
    setMsg("Saved. Open the plugin in this file and hit Fill from Anker.")
  }

  async function generate() {
    if (!deck.fundId) { setMsg("Pick a fund first."); return }
    setGenerating(true); setMsg("Generating from your fund context…")
    try {
      const r = await fetch(`/api/decks/${deck.id}/generate`, { method: "POST" })
      const j = await r.json()
      if (!r.ok) { setMsg(j?.error || "Generate failed") }
      else {
        setMsg(`Generated ${j.generated} field(s) — review them below, then send to Figma.`)
        // Pull the fresh AI fields into the editor.
        const fresh = await fetch(`/api/decks/${deck.id}`).then((x) => x.json()).catch(() => null)
        if (fresh) setDeck(fresh)
        router.refresh()
      }
    } finally { setGenerating(false) }
  }

  async function saveValues() {
    setSaving(true)
    const ok = await patch({ values })
    if (ok) { setDirty(false); setMsg("Content saved — your edits override AI copy in the Figma payload.") }
    setSaving(false)
  }

  const prefill = (e: MappingEntry): string =>
    values[e.nodeId] ?? deck.aiGeneratedFields?.[e.nodeId] ?? ""

  const labelFor = (e: MappingEntry): string =>
    e.field || e.note || (e.originalText ? e.originalText.slice(0, 48) : e.nodeId)

  const stepIdx = STATUSES.indexOf(deck.status as any)
  const lbl = "font-mono text-[9px] uppercase tracking-wider text-muted-foreground"

  return (
    <div className="min-h-screen">
      <div className="border-b border-foreground/10">
        <div className="max-w-[1100px] mx-auto px-6 lg:px-12 py-8">
          <Link href="/dashboard/decks"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
            <ArrowLeft className="w-4 h-4" /> Decks
          </Link>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <span className="inline-flex items-center gap-3 text-sm font-mono text-muted-foreground mb-2">
                <span className="w-8 h-px bg-foreground/30" />
                {(template?.deck_type ?? "deck").replace(/_/g, " ")}
              </span>
              <h1 className="text-3xl lg:text-4xl font-display tracking-tight leading-[0.95]">
                {template?.name || `Template ${template?.file_key?.slice(-6)}`}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {/* Status stepper */}
              <div className="flex items-center rounded-full border border-foreground/15 overflow-hidden">
                {STATUSES.map((s, i) => (
                  <button key={s} onClick={() => setStatus(s)}
                    className={`h-8 px-3 text-[10px] font-mono uppercase tracking-wider ${
                      deck.status === s ? "bg-foreground text-background"
                      : i < stepIdx ? "text-foreground" : "text-muted-foreground hover:bg-foreground/5"}`}>
                    {i < stepIdx ? "✓ " : ""}{s}
                  </button>
                ))}
              </div>
              <button onClick={() => setStatus("archived")} title="Archive deck"
                className="h-8 w-8 rounded-full border border-foreground/15 flex items-center justify-center text-muted-foreground hover:text-foreground">
                <Archive className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1100px] mx-auto px-6 lg:px-12 py-8 space-y-6">
        {msg && (
          <div className="p-3 rounded-md border border-foreground/15 bg-foreground/[0.03] text-sm">{msg}</div>
        )}

        <div className="grid lg:grid-cols-2 gap-6 items-start">
          {/* 1 · Fund */}
          <section className="border border-foreground/10 rounded-lg p-5 space-y-3">
            <h2 className={lbl}>1 · Fund context</h2>
            <select value={deck.fundId ?? ""} onChange={(e) => setFund(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm">
              <option value="">Select a fund…</option>
              {funds.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <p className="text-xs text-muted-foreground leading-relaxed">
              The AI writes every narrative slot from this fund&apos;s record — thesis, terms,
              team, track record, portfolio.
            </p>
          </section>

          {/* 2 · Workspace copy */}
          <section className="border border-foreground/10 rounded-lg p-5 space-y-3">
            <h2 className={lbl}>2 · Your Figma copy</h2>
            <ol className="ml-4 list-decimal space-y-1 text-xs text-muted-foreground">
              <li>
                <a href={`https://www.figma.com/community/file/${template?.file_key}`} target="_blank" rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-foreground">Open the community template</a>{" "}
                → <b>Use template</b>.
              </li>
              <li>Paste your new file&apos;s URL here.</li>
            </ol>
            <div className="flex gap-2">
              <input value={workspaceUrl} onChange={(e) => setWorkspaceUrl(e.target.value)}
                placeholder="https://www.figma.com/file/…"
                className="flex-1 h-10 px-3 rounded-md border border-input bg-background text-sm" />
              <button onClick={saveWorkspaceUrl}
                className="h-10 px-4 rounded-full bg-foreground text-background text-sm hover:bg-foreground/90">Save</button>
            </div>
            {deck.workspaceFileKey && (
              <div className="flex items-center gap-2 text-xs text-emerald-700">
                <Check className="w-3.5 h-3.5" /> Linked: <code className="font-mono">{deck.workspaceFileKey}</code>
                {deck.workspaceFileUrl && (
                  <a href={deck.workspaceFileUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 underline underline-offset-2">
                    open <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            )}
          </section>
        </div>

        {/* 3 · Generate */}
        <section className="border border-foreground/10 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className={lbl}>3 · Generate copy</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Fills every narrative slot in the approved mapping, respecting each slot&apos;s character budget.
                {deck.lastFilledAt ? ` Last generated ${new Date(deck.lastFilledAt).toLocaleString()}.` : ""}
              </p>
            </div>
            <button onClick={generate} disabled={generating || !deck.fundId}
              className="inline-flex items-center gap-2 rounded-full h-10 px-5 bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {generating ? "Generating…" : "Generate with AI"}
            </button>
          </div>
        </section>

        {/* 4 · Review & edit — the new heart of the page */}
        <section className="border border-foreground/10 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-foreground/10 flex items-center justify-between gap-4">
            <div>
              <h2 className={lbl}>4 · Review &amp; edit content</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entries.length
                  ? `${entries.length} mapped slot(s). Your edits win over AI copy in the Figma payload.`
                  : "This template's node mapping isn't approved yet — run the mapping flow in the Figma plugin first."}
              </p>
            </div>
            {dirty && (
              <button onClick={saveValues} disabled={saving}
                className="inline-flex items-center gap-2 rounded-full h-9 px-4 bg-foreground text-background text-sm disabled:opacity-50">
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Save content
              </button>
            )}
          </div>
          {entries.length > 0 && (
            <div className="divide-y divide-foreground/5">
              {entries.map((e) => {
                const v = prefill(e)
                const isAi = !values[e.nodeId] && !!deck.aiGeneratedFields?.[e.nodeId]
                const over = e.budget ? v.length > e.budget : false
                return (
                  <div key={e.nodeId} className="px-5 py-4">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-medium">{labelFor(e)}</span>
                      {typeof e.slide === "number" && (
                        <span className="font-mono text-[9px] text-muted-foreground">slide {e.slide + 1}</span>
                      )}
                      {isAi && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-full bg-foreground/5 text-muted-foreground">AI</span>}
                      <span className={`ml-auto font-mono text-[10px] ${over ? "text-destructive" : "text-muted-foreground"}`}>
                        {v.length}{e.budget ? `/${e.budget}` : ""}
                      </span>
                    </div>
                    <textarea
                      value={v}
                      onChange={(ev) => { setValues((prev) => ({ ...prev, [e.nodeId]: ev.target.value })); setDirty(true) }}
                      rows={Math.min(6, Math.max(1, Math.ceil(v.length / 90)))}
                      placeholder={e.originalText ? `Template text: ${e.originalText.slice(0, 120)}` : "Write this slot…"}
                      className="w-full p-2.5 rounded-md border border-input bg-background text-sm leading-relaxed"
                    />
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* 5 · Send to Figma */}
        <section className="border border-foreground/10 rounded-lg p-5">
          <h2 className={lbl}>5 · Send to Figma</h2>
          <div className="mt-2 flex items-center gap-3 flex-wrap text-sm text-muted-foreground">
            <Figma className="w-4 h-4 shrink-0" />
            <span>Open your copy → Plugins → <b className="text-foreground">Anker Decks</b> → paste deck id</span>
            <code className="font-mono text-xs px-2 py-1 rounded bg-foreground/5 select-all">{deck.id}</code>
            <span>→ <b className="text-foreground">Apply</b>. Priority: your edits → AI copy → fund fields.</span>
          </div>
        </section>
      </div>
    </div>
  )
}

function extractKey(url: string): string | null {
  const m = url.match(/figma\.com\/(?:file|design)\/([A-Za-z0-9]+)/)
  return m ? m[1] : null
}
