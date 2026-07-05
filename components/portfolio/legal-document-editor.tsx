"use client"

/**
 * Legal & Compliance — single-document editor + download surface.
 *
 * Three modes:
 *   - VIEW    : paper-style page, Markdown rendered with TBD pills
 *   - EDIT    : Markdown body in a textarea (monospaced, full-bleed
 *               inside the paper card). Save persists to
 *               /api/.../legal/documents/[docKey] (POST). Discard
 *               drops the override and reverts to the template-rendered
 *               body via DELETE.
 *   - SAVING  : Save in flight; disables both buttons.
 *
 * The Word/PDF/Markdown download buttons in the header always point
 * at the API and always reflect whichever body is current (override
 * if saved, template body otherwise) — see the route handler.
 *
 * "Modified" badge in the header signals an existing override. Hovering
 * shows the last-edit timestamp + author.
 */

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Download, FileType, FileCode, FileText, ExternalLink,
  Lock, Pencil, Save, X, Loader2, AlertTriangle, RotateCcw,
} from "lucide-react"
import type { DocumentDef } from "@/lib/portfolio/legal-catalogue"
import { LegalDocumentRenderedBody } from "@/components/portfolio/legal-document-rendered-body"

interface InitialPayload {
  docKey: string
  title: string
  source: string
  /** Body currently displayed (override if any, else field-substituted). */
  body: string
  /** Template body without overrides, for the Discard revert flow. */
  templateBody: string
  isOverride: boolean
  overrideUpdatedAt: string | null
  overrideUpdatedBy: string | null
  stats: { totalSlots: number; filledSlots: number; approvedSlots: number; tbdSlots: number }
}

interface Props {
  fundId: string
  fundName: string
  editorBase: string
  catalogueEntry?: DocumentDef
  initial: InitialPayload
}

type Mode = "view" | "edit" | "saving"

export function LegalDocumentEditor({ fundId, fundName, editorBase, catalogueEntry, initial }: Props) {
  const apiBase = `/api/portfolio/funds/${fundId}/legal/documents/${initial.docKey}`
  const [body, setBody] = useState<string>(initial.body)
  const [draft, setDraft] = useState<string>(initial.body)
  const [isOverride, setIsOverride] = useState<boolean>(initial.isOverride)
  const [updatedAt, setUpdatedAt] = useState<string | null>(initial.overrideUpdatedAt)
  const [updatedBy, setUpdatedBy] = useState<string | null>(initial.overrideUpdatedBy)
  const [mode, setMode] = useState<Mode>("view")
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // When entering edit mode, give the textarea focus + scroll to its top.
  useEffect(() => {
    if (mode === "edit" && textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.scrollTop = 0
    }
  }, [mode])

  async function save() {
    setMode("saving"); setError(null)
    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      setBody(draft)
      setIsOverride(true)
      setUpdatedAt(data?.override?.updatedAt ?? new Date().toISOString())
      setUpdatedBy(data?.override?.updatedBy ?? null)
      setMode("view")
    } catch (e: any) {
      setError(e?.message ?? "Save failed")
      setMode("edit")
    }
  }

  async function discard() {
    if (!confirm("Discard your edits and revert to the template-rendered document?")) return
    setMode("saving"); setError(null)
    try {
      const res = await fetch(apiBase, { method: "DELETE" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Discard failed (${res.status})`)
      // Pull the fresh template-rendered body (with TBD spans) so the
      // viewer re-paints as if we'd never edited.
      const refresh = await fetch(apiBase).then(r => r.json()).catch(() => null)
      const newBody = refresh?.body ?? initial.templateBody
      setBody(newBody); setDraft(newBody)
      setIsOverride(false); setUpdatedAt(null); setUpdatedBy(null)
      setMode("view")
    } catch (e: any) {
      setError(e?.message ?? "Discard failed")
      setMode("view")
    }
  }

  const editing = mode === "edit"
  const busy = mode === "saving"

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-foreground/10 bg-background/95 backdrop-blur">
        <div className="px-6 py-3 flex items-center gap-3 flex-wrap">
          <Link
            href="/dashboard/portfolio/fund/legal/documents"
            className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-foreground/75 hover:text-foreground"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> All documents
          </Link>
          <div className="w-px h-5 bg-foreground/10" />
          <FileText className="w-4 h-4 text-muted-foreground" />
          <h1 className="text-sm font-medium">{initial.title}</h1>
          {catalogueEntry?.entityKind && (
            <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70 px-2 py-0.5 border border-foreground/15 rounded">
              {catalogueEntry.entityKind.replace(/_/g, " ")}
            </span>
          )}
          {isOverride && (
            <span
              className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 border border-amber-500/30 bg-amber-500/5 text-amber-700 rounded"
              title={`Edited${updatedAt ? ` ${new Date(updatedAt).toLocaleString()}` : ""}${updatedBy ? ` · ${updatedBy}` : ""}`}
            >
              Modified
            </span>
          )}
          <div className="flex-1" />

          {/* Edit / Save / Discard */}
          {!editing && (
            <button
              type="button"
              onClick={() => { setDraft(body); setMode("edit"); setError(null) }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10"
              title="Edit this document in-browser"
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          {isOverride && !editing && (
            <button
              type="button"
              onClick={discard}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10 disabled:opacity-50"
              title="Discard edits and revert to template"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Revert
            </button>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={() => { setDraft(body); setMode("view"); setError(null) }}
                disabled={busy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10 disabled:opacity-50"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                type="button"
                onClick={save}
                disabled={busy || draft === body}
                className="inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md bg-foreground text-background font-medium hover:bg-foreground/90 disabled:bg-foreground/15 disabled:text-muted-foreground/80 disabled:cursor-not-allowed"
              >
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                {busy ? "Saving…" : "Save changes"}
              </button>
            </>
          )}

          {/* Downloads — always available, always reflect current body */}
          <div className="w-px h-5 bg-foreground/10 mx-1" />
          <a
            href={`${apiBase}?format=docx`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10"
            title="Download as editable Word document"
          >
            <FileType className="w-3.5 h-3.5" /> Word
          </a>
          <a
            href={`${apiBase}?format=pdf`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10"
            title="Download as PDF"
          >
            <Download className="w-3.5 h-3.5" /> PDF
          </a>
          <a
            href={`${apiBase}?format=md`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10"
            title="Download as Markdown"
          >
            <FileCode className="w-3.5 h-3.5" /> Markdown
          </a>
          <Link
            href={editorBase}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border border-foreground/15 text-foreground/80 hover:bg-foreground/10"
          >
            Edit fields <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Slot stats — only meaningful when viewing the template body. */}
        {!isOverride && (
          <div className="px-6 pb-3 space-y-1.5">
            <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider">
              <span className="text-muted-foreground">Slots</span>
              <span className="text-muted-foreground/70">·</span>
              <span><span className="text-emerald-600">{initial.stats.approvedSlots}</span> approved</span>
              <span><span className="text-amber-600">{initial.stats.filledSlots - initial.stats.approvedSlots}</span> filled</span>
              <span><span className="text-rose-700">{initial.stats.tbdSlots}</span> TBD</span>
              <span className="text-muted-foreground/70">·</span>
              <span className="text-muted-foreground">{initial.stats.totalSlots} total</span>
            </div>
            <div className="h-1.5 w-full bg-foreground/10 rounded overflow-hidden flex">
              <div className="h-full bg-emerald-500"
                style={{ width: `${(initial.stats.approvedSlots / Math.max(1, initial.stats.totalSlots)) * 100}%` }} />
              <div className="h-full bg-amber-500"
                style={{ width: `${((initial.stats.filledSlots - initial.stats.approvedSlots) / Math.max(1, initial.stats.totalSlots)) * 100}%` }} />
            </div>
          </div>
        )}
      </header>

      <div className="border-b border-foreground/10 bg-foreground/[0.03] px-6 py-2.5">
        <div className="max-w-4xl mx-auto flex items-start gap-2 text-[11px] text-muted-foreground italic">
          <Lock className="w-3 h-3 mt-0.5 shrink-0" />
          <span>
            <span className="font-mono uppercase tracking-wider text-muted-foreground/80 not-italic">Source · </span>
            {initial.source}
          </span>
        </div>
      </div>

      <div className="border-b border-foreground/10 bg-amber-500/[0.04] px-6 py-2 text-[11px] text-amber-700/85 text-center">
        <strong className="font-medium">Not legal advice.</strong> Templates are starting points only — outside counsel must review and finalize every executed document.
      </div>

      {error && (
        <div className="border-b border-rose-500/30 bg-rose-500/5 px-6 py-2 text-[11px] text-rose-700">
          <div className="max-w-4xl mx-auto inline-flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> {error}
          </div>
        </div>
      )}

      {/* Paper-style document surface */}
      <div className="bg-foreground/[0.04] py-10">
        <article className="max-w-[8.5in] mx-auto bg-background shadow-md ring-1 ring-foreground/10 rounded-sm px-[1in] py-[0.85in] font-serif">
          <header className="text-center mb-8 pb-6 border-b border-foreground/10">
            <h2 className="font-display text-2xl font-semibold tracking-tight">{initial.title}</h2>
            <div className="mt-1.5 text-sm text-muted-foreground italic">{fundName}</div>
          </header>
          {editing ? (
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck
              className="w-full min-h-[60vh] font-mono text-sm leading-relaxed bg-foreground/[0.02] border border-foreground/10 rounded-md p-4 focus:outline-none focus:ring-2 focus:ring-foreground/30 resize-y"
              placeholder="Edit the document body in Markdown…"
            />
          ) : (
            <LegalDocumentRenderedBody body={body} editorBase={editorBase} />
          )}
          <footer className="mt-10 pt-4 border-t border-foreground/10 text-[10px] text-muted-foreground/80 text-center font-sans">
            {isOverride
              ? <>Edited {updatedAt ? new Date(updatedAt).toLocaleString() : ""}{updatedBy ? ` by ${updatedBy}` : ""}</>
              : <>Generated by Anker · {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</>
            }
          </footer>
        </article>
      </div>
    </main>
  )
}
