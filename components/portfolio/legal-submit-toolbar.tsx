"use client"

/**
 * Legal & Compliance — submit toolbar (phase 5).
 *
 * Shared right-side cluster that appears in the canvas, fields editor,
 * and documents-review header. Three pieces:
 *   1. Credits counter — shows real balance from the funds row
 *   2. Status pill — Draft / Submitted / In Review / Needs Changes / Approved
 *   3. Submit modal trigger — opens a confirm dialog that:
 *        • lists every required-but-empty field as a deep-link
 *        • disables the confirm button until credits >= 1 AND blocking is empty
 *        • on confirm, POSTs and surfaces the resulting status pill
 *
 * Optional Purchase-1 button only renders when the page passes
 * `canPurchase` — admin pages can leave it on, public LP views won't.
 *
 * Single component, used three places — keeps one source of truth for
 * the gating logic so the editor + documents view + canvas never get
 * out of sync on what blocks submit.
 */

import { useState } from "react"
import { Send, CheckCircle2, AlertTriangle, Clock, Loader2, X, ExternalLink } from "lucide-react"
import Link from "next/link"
import type { LegalReviewState, LegalReviewStatus } from "@/lib/portfolio/legal-reviews"

interface Props {
  fundId: string
  state: LegalReviewState
  /** Where TBD pills inside the modal should deep-link. */
  editorBasePath?: string
  /**
   * @deprecated Credits are no longer rendered. Kept on the type for
   * backward compatibility with old call sites. Ignored.
   */
  canPurchase?: boolean
  /**
   * @deprecated Credits chip removed. Kept on the type so the existing
   * `compact` prop on call sites doesn't error.
   */
  compact?: boolean
  onStateChange?: (s: LegalReviewState) => void
}

export function LegalSubmitToolbar({
  fundId, state, editorBasePath = "/dashboard/portfolio/fund/legal/fields",
  onStateChange,
}: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [s, setS] = useState<LegalReviewState>(state)

  function apply(next: LegalReviewState) {
    setS(next)
    onStateChange?.(next)
  }

  async function submit() {
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fundId}/legal/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Submit failed (${res.status})`)
      apply(data as LegalReviewState)
      setOpen(false)
    } catch (e: any) {
      setError(e?.message ?? "Submit failed")
    } finally { setBusy(false) }
  }

  const statusInfo = STATUS_DISPLAY[s.currentStatus]
  // Submit is gated on (a) being in draft and (b) every required field
  // being populated. Credits are no longer part of the gate.
  const submitDisabled = s.currentStatus !== "draft" || s.blockingFields.length > 0

  return (
    <>
      <div className="inline-flex items-center gap-2 flex-wrap">
        {/* Status pill */}
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border ${statusInfo.tone}`}>
          {statusInfo.dot}
          {statusInfo.label}
        </span>

        {/* Submit-for-review */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={submitDisabled && s.currentStatus === "draft"}
          className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs rounded-md font-medium transition-colors ${
            s.currentStatus === "draft"
              ? "bg-foreground text-background hover:bg-foreground/90 disabled:bg-foreground/15 disabled:text-muted-foreground/70 disabled:cursor-not-allowed"
              : "bg-foreground/10 text-muted-foreground cursor-not-allowed"
          }`}
          title={
            s.currentStatus !== "draft" ? `Already ${statusInfo.label.toLowerCase()}`
              : s.blockingFields.length > 0 ? `${s.blockingFields.length} required field(s) still empty`
              : "Open submit confirmation"
          }
        >
          <Send className="w-3.5 h-3.5" />
          {s.currentStatus === "draft" ? "Submit for Legal Review" : statusInfo.label}
        </button>
      </div>

      {/* Submit confirmation modal */}
      {open && (
        <SubmitModal
          state={s}
          editorBasePath={editorBasePath}
          busy={busy}
          error={error}
          onClose={() => { setOpen(false); setError(null) }}
          onSubmit={submit}
        />
      )}
    </>
  )
}

// ── status display map ────────────────────────────────────────────────-

const STATUS_DISPLAY: Record<LegalReviewStatus, { label: string; tone: string; dot: React.ReactNode }> = {
  draft:         { label: "Draft",         tone: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700", dot: <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> },
  submitted:     { label: "Submitted",     tone: "border-violet-500/30 bg-violet-500/5 text-violet-700",    dot: <span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> },
  in_review:     { label: "In Review",     tone: "border-sky-500/30 bg-sky-500/5 text-sky-700",             dot: <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" /> },
  needs_changes: { label: "Needs Changes", tone: "border-amber-500/30 bg-amber-500/5 text-amber-700",       dot: <AlertTriangle className="w-3 h-3" /> },
  approved:      { label: "Approved",      tone: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700", dot: <CheckCircle2 className="w-3 h-3" /> },
  cancelled:     { label: "Cancelled",     tone: "border-foreground/15 text-muted-foreground/80",                  dot: <X className="w-3 h-3" /> },
}

// ── modal ──────────────────────────────────────────────────────────────-

function SubmitModal({
  state, editorBasePath, busy, error, onClose, onSubmit,
}: {
  state: LegalReviewState
  editorBasePath: string
  busy: boolean
  error: string | null
  onClose: () => void
  onSubmit: () => void
}) {
  // Credits gate removed. Submit-ready iff all required fields are filled.
  const ready = state.blockingFields.length === 0
  const total = state.currentReview?.totalFields ?? null
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-lg border border-foreground/15 bg-background text-foreground shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-4 border-b border-foreground/10 flex items-center gap-3">
          <Send className="w-4 h-4 text-emerald-600" />
          <h3 className="text-sm font-medium">Submit for Legal Review</h3>
          <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-foreground/10">
            <X className="w-4 h-4" />
          </button>
        </header>
        <div className="px-5 py-4 space-y-4 text-sm">
          {/* Pre-submit summary */}
          <div className="rounded-md border border-foreground/10 bg-foreground/[0.03] p-3">
            <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
              On submit, the legal team will receive:
            </p>
            <ul className="text-xs space-y-1">
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" /> A pinned snapshot of every field value and approval at this moment</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" /> Generated narratives + computed values rendered as final text</li>
              <li className="flex items-center gap-2"><CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" /> All 13 documents bound to their source fields</li>
            </ul>
          </div>

          {/* Blockers */}
          {state.blockingFields.length > 0 ? (
            <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span className="text-xs font-medium text-rose-700">
                  {state.blockingFields.length} required field{state.blockingFields.length === 1 ? "" : "s"} still empty
                </span>
              </div>
              <ul className="text-xs space-y-1 max-h-40 overflow-y-auto pr-1">
                {state.blockingFields.map((b) => (
                  <li key={b.key}>
                    <Link
                      href={`${editorBasePath}?field=${encodeURIComponent(b.key)}`}
                      className="inline-flex items-center gap-1.5 text-rose-700 hover:text-rose-100 hover:underline"
                      onClick={onClose}
                    >
                      <Clock className="w-3 h-3" /> {b.label}
                      <ExternalLink className="w-3 h-3 opacity-60" />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 inline-flex items-center gap-2 w-full">
              <CheckCircle2 className="w-4 h-4" /> All required fields are populated.
            </div>
          )}

          {error && (
            <div className="text-xs text-rose-700 inline-flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </div>
          )}
        </div>
        <footer className="px-5 py-3 border-t border-foreground/10 flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs rounded-md border border-foreground/15 hover:bg-foreground/10">
            Cancel
          </button>
          <button
            onClick={onSubmit}
            disabled={!ready || busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-foreground text-background font-medium hover:bg-foreground/90 disabled:bg-foreground/15 disabled:text-muted-foreground/80 disabled:cursor-not-allowed"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            {busy ? "Submitting…" : "Submit for review"}
          </button>
        </footer>
      </div>
    </div>
  )
}
