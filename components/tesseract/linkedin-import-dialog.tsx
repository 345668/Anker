"use client"

/**
 * LinkedInImportDialog — paste-HTML ingest panel for LinkedIn profiles.
 *
 * The workflow this enables (Claude in Chrome extension):
 *   1. In your browser, open the investor's LinkedIn profile (you're
 *      already signed in, so the page renders fully).
 *   2. Run Claude in Chrome: "Read this page and POST the HTML to
 *      /api/agents/linkedin/ingest with the URL".  The extension can
 *      capture the rendered HTML and call the Anker endpoint directly.
 *   3. Or paste the page source yourself (View Source → copy → paste
 *      here).
 *
 * On submit, /api/agents/linkedin/ingest runs the HTML through
 * lib/agents/linkedin-public.ts parseProfileSnippetHtml() and persists
 * the structured snippet to crm_entries.linkedin_data.  The first time
 * a row is ingested, the snippet digest is written to research_summary
 * so the rest of the platform (CRM, Outreach Studio, Curate exports)
 * picks it up.
 */

import { useEffect, useState } from "react"
import { X, Loader2, Sparkles, Check, AlertTriangle, ClipboardPaste, Linkedin } from "lucide-react"

interface ParsedSnippet {
  url: string
  finalUrl: string
  ok: boolean
  status: number
  loginWall: boolean
  displayLabel: string | null
  fullName: string | null
  headline: string | null
  description: string | null
  bodyText: string | null
  extracted: {
    fullName?: string
    title?: string
    firm?: string
    location?: string
    summary?: string
    pastFirms?: string[]
    confidence?: number
  }
  fetchedAt: string
  notes: string[]
}

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-fill the URL field (typically the investor's LinkedIn). */
  defaultUrl?: string
  /** Match the ingest to this CRM entry (bypasses URL-based lookup). */
  crmEntryId?: string
  /** Called after a successful ingest (e.g. to refresh the studio). */
  onIngested?: (snippet: ParsedSnippet) => void
}

const HELP_PROMPT = `Hey Claude (in Chrome) — read this LinkedIn profile, then POST { url, html, finalUrl, status } to my Anker /api/agents/linkedin/ingest endpoint.  Use the current tab URL as both url and finalUrl, status 200, and the rendered document.documentElement.outerHTML as html.`

export function LinkedInImportDialog({ open, onClose, defaultUrl = "", crmEntryId, onIngested }: Props) {
  const [url, setUrl] = useState(defaultUrl)
  const [html, setHtml] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [snippet, setSnippet] = useState<ParsedSnippet | null>(null)
  const [copied, setCopied] = useState(false)

  // Reset when reopened.
  useEffect(() => {
    if (open) { setUrl(defaultUrl); setHtml(""); setError(null); setSnippet(null); setCopied(false) }
  }, [open, defaultUrl])

  async function submit() {
    if (!url.trim()) { setError("URL required"); return }
    if (!html.trim() || html.length < 50) { setError("Paste the rendered HTML (need at least 50 chars)"); return }
    setBusy(true); setError(null); setSnippet(null)
    try {
      const res = await fetch("/api/agents/linkedin/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, html, finalUrl: url, status: 200, crmEntryId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? "Ingest failed"); return }
      setSnippet(data.snippet as ParsedSnippet)
      onIngested?.(data.snippet as ParsedSnippet)
    } catch (e: any) { setError(e?.message ?? "Ingest failed") }
    finally { setBusy(false) }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(HELP_PROMPT)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {/* ignore */}
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) setHtml(text)
    } catch {/* ignore */}
  }

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div
        className="relative w-[680px] max-w-full max-h-[85vh] overflow-y-auto bg-background border border-foreground/10 rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-foreground/10 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              <Linkedin className="w-3 h-3" /> Ingest LinkedIn HTML
            </div>
            <h2 className="font-display text-xl">Import a LinkedIn profile</h2>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              LinkedIn blocks bot fetches.  Capture the rendered HTML from your authenticated browser
              session — either via the Claude in Chrome extension or by pasting View Source — and
              we&apos;ll parse it the same way the Anker LinkedIn scraper does.
            </p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-sm">
          {/* Chrome-extension prompt helper */}
          <div className="border border-foreground/10 rounded-md p-3 bg-foreground/[0.02]">
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Drive via Claude in Chrome
              </div>
              <button
                onClick={copyPrompt}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-foreground/15 hover:bg-foreground/5"
                title="Copy the prompt to paste into a Claude-in-Chrome session"
              >
                {copied ? <Check className="w-3 h-3" /> : <ClipboardPaste className="w-3 h-3" />}
                copy prompt
              </button>
            </div>
            <pre className="text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground">{HELP_PROMPT}</pre>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
              Profile URL
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.linkedin.com/in/…"
              className="w-full px-3 py-2 text-sm border border-foreground/15 rounded-md bg-background"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                Rendered HTML
              </label>
              <button
                onClick={pasteFromClipboard}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                title="Paste from clipboard"
              >
                <ClipboardPaste className="w-3 h-3" /> paste
              </button>
            </div>
            <textarea
              value={html}
              onChange={(e) => setHtml(e.target.value)}
              rows={10}
              placeholder="<!DOCTYPE html>… (paste the full page source here)"
              className="w-full px-3 py-2 text-xs font-mono border border-foreground/15 rounded-md bg-background leading-relaxed"
            />
            <div className="text-[10px] text-muted-foreground mt-1">{html.length} chars</div>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}

          {snippet && (
            <div className="border border-foreground/10 rounded-md p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                <Sparkles className="w-3 h-3" /> Parsed snippet
                {snippet.loginWall && <span className="text-amber-600">· login wall</span>}
                {typeof snippet.extracted?.confidence === "number" && (
                  <span>· confidence {(snippet.extracted.confidence * 100).toFixed(0)}%</span>
                )}
              </div>
              <table className="w-full text-[11px]">
                <tbody>
                  {snippet.fullName && (<tr><td className="font-mono text-muted-foreground pr-2 align-top">Name</td><td>{snippet.fullName}</td></tr>)}
                  {snippet.headline && (<tr><td className="font-mono text-muted-foreground pr-2 align-top">Headline</td><td>{snippet.headline}</td></tr>)}
                  {snippet.extracted?.title && (<tr><td className="font-mono text-muted-foreground pr-2 align-top">Title</td><td>{snippet.extracted.title}</td></tr>)}
                  {snippet.extracted?.firm && (<tr><td className="font-mono text-muted-foreground pr-2 align-top">Firm</td><td>{snippet.extracted.firm}</td></tr>)}
                  {snippet.extracted?.location && (<tr><td className="font-mono text-muted-foreground pr-2 align-top">Location</td><td>{snippet.extracted.location}</td></tr>)}
                  {snippet.extracted?.summary && (<tr><td className="font-mono text-muted-foreground pr-2 align-top">Summary</td><td>{snippet.extracted.summary}</td></tr>)}
                  {snippet.extracted?.pastFirms?.length ? (<tr><td className="font-mono text-muted-foreground pr-2 align-top">Past firms</td><td>{snippet.extracted.pastFirms.join(", ")}</td></tr>) : null}
                  {snippet.description && (<tr><td className="font-mono text-muted-foreground pr-2 align-top">Description</td><td>{snippet.description}</td></tr>)}
                </tbody>
              </table>
              {snippet.notes.length > 0 && (
                <div className="text-[10px] text-muted-foreground border-t border-foreground/10 pt-2">
                  notes: {snippet.notes.join(" · ")}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-foreground/10 flex items-center justify-end gap-2">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded-md hover:bg-foreground/5">Close</button>
          <button
            onClick={submit}
            disabled={busy || !url.trim() || html.length < 50}
            className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            Parse + save
          </button>
        </div>
      </div>
    </div>
  )
}
