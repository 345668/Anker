"use client"

/**
 * Supporting sections for the deal workroom, split out of deal-detail-client
 * to keep that file manageable:
 *
 *   GateChecklist    the required entries/checks for advancing the current stage
 *   StageNav         move-back (regress) + reopen controls
 *   FoundersSection  deal-scoped founder profiles (CRUD + photo)
 *   DataRoomSection  categorized document uploads (private blob) + downloads
 *
 * All DB types are imported as `import type`; the only runtime imports are the
 * DB-free constant modules, so this never pulls `pg` into the browser bundle.
 */

import { useRef, useState } from "react"
import { upload } from "@vercel/blob/client"
import {
  Check, X, Undo2, RotateCcw, Plus, Trash2, Star, Upload, FileText,
  Loader2, UserPlus, ChevronDown,
} from "lucide-react"
import type { DealStage } from "@/lib/portfolio/deal-constants"
import { ACTIVE_STAGES, canRegress, type GateResult } from "@/lib/portfolio/deal-stage-gates"
import type { DealFounder } from "@/lib/portfolio/deal-founders"
import {
  DEAL_DOC_CATEGORIES, DEAL_DOC_CATEGORY_LABELS, type DealDocument, type DealDocCategory,
} from "@/lib/portfolio/deal-document-constants"

const STAGE_LABEL: Record<DealStage, string> = {
  sourced: "Sourced", screened: "Screened", deep_dive: "Deep dive",
  ic_scheduled: "IC", ic_approved: "IC approved", term_sheet: "Term sheet",
  committed: "Committed", closed: "Closed", passed: "Passed",
}

/* ── Gate checklist ─────────────────────────────────────────────────────── */

export function GateChecklist({ gate, nextLabel }: { gate: GateResult[]; nextLabel: string | null }) {
  if (gate.length === 0) return null
  const done = gate.filter((g) => g.ok).length
  const allOk = done === gate.length
  return (
    <div className="border border-foreground/10 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg">Stage requirements</h3>
        <span className={`font-mono text-[11px] px-2 py-1 rounded-full border ${
          allOk ? "text-emerald-700 border-emerald-500/30 bg-emerald-500/5"
            : "text-amber-700 border-amber-500/30 bg-amber-500/5"
        }`}>
          {done}/{gate.length} complete
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-3">
        {allOk
          ? nextLabel ? `All checks pass — you can advance to ${nextLabel}.` : "All checks pass."
          : `Complete these before advancing${nextLabel ? ` to ${nextLabel}` : ""}.`}
      </p>
      <ul className="space-y-2">
        {gate.map((g) => (
          <li key={g.key} className="flex items-start gap-2.5">
            <span className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center ${
              g.ok ? "bg-emerald-500/15 text-emerald-700" : "bg-foreground/5 text-muted-foreground"
            }`}>
              {g.ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            </span>
            <div>
              <p className={`text-sm ${g.ok ? "text-foreground" : "font-medium"}`}>{g.label}</p>
              {!g.ok && <p className="text-xs text-muted-foreground">{g.hint}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ── Stage navigation (move back / reopen) ──────────────────────────────── */

export function StageNav({
  stage, busy, onRegress, onReopen,
}: {
  stage: DealStage
  busy: boolean
  onRegress: (to: DealStage, note: string) => void
  onReopen: (to: DealStage, unwind: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [unwind, setUnwind] = useState(false)
  const isTerminalClosed = stage === "closed"
  const isPassed = stage === "passed"

  // Which active stages can we move to?
  const backTargets = ACTIVE_STAGES.filter((s) => canRegress(stage, s))
  const reopenTargets = isTerminalClosed || isPassed ? ACTIVE_STAGES : []

  if (backTargets.length === 0 && reopenTargets.length === 0) return null

  return (
    <div className="border border-foreground/10 rounded-lg p-4">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-sm font-medium">
        <span className="inline-flex items-center gap-2">
          {isTerminalClosed || isPassed ? <RotateCcw className="w-4 h-4" /> : <Undo2 className="w-4 h-4" />}
          {isTerminalClosed ? "Reopen closed deal" : isPassed ? "Reopen passed deal" : "Move deal back"}
        </span>
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {!isTerminalClosed && !isPassed && (
            <p className="text-xs text-muted-foreground">
              Backward moves aren&apos;t gated — use this to correct course. The move is recorded in stage history.
            </p>
          )}

          {isTerminalClosed && (
            <label className="flex items-start gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={unwind} onChange={(e) => setUnwind(e.target.checked)} className="mt-0.5" />
              <span>
                Detach the linked investment. The investment row is preserved for audit; leave unchecked to
                keep it on the fund&apos;s books while reopening.
              </span>
            </label>
          )}

          <input value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Reason / note (optional)"
            className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm" />

          <div className="flex flex-wrap gap-2">
            {(isTerminalClosed || isPassed ? reopenTargets : backTargets).map((s) => (
              <button key={s} disabled={busy}
                onClick={() => (isTerminalClosed || isPassed) ? onReopen(s, unwind) : onRegress(s, note)}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-foreground/15 hover:bg-foreground/5 text-xs font-mono disabled:opacity-50">
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Undo2 className="w-3 h-3" />}
                {STAGE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Founders ───────────────────────────────────────────────────────────── */

interface FounderDraft {
  name: string; role: string; email: string; linkedinUrl: string; bio: string; ownershipPct: string
}
const emptyDraft: FounderDraft = { name: "", role: "", email: "", linkedinUrl: "", bio: "", ownershipPct: "" }

export function FoundersSection({
  apiBase, founders, onChange, readOnly,
}: {
  apiBase: string
  founders: DealFounder[]
  onChange: (list: DealFounder[]) => void
  readOnly: boolean
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState<FounderDraft>(emptyDraft)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function req(path: string, init: RequestInit, tag: string) {
    setBusy(tag); setError(null)
    try {
      const res = await fetch(path, { headers: { "Content-Type": "application/json" }, ...init })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`)
      return data
    } catch (e: any) { setError(e?.message ?? "Request failed"); return null }
    finally { setBusy(null) }
  }

  async function addFounder() {
    if (!draft.name.trim()) { setError("Founder name is required."); return }
    const data = await req(`${apiBase}/founders`, {
      method: "POST",
      body: JSON.stringify({
        name: draft.name, role: draft.role || null, email: draft.email || null,
        linkedinUrl: draft.linkedinUrl || null, bio: draft.bio || null,
        ownershipPct: draft.ownershipPct ? Number(draft.ownershipPct) : null,
      }),
    }, "add")
    if (data?.founders) { onChange(data.founders); setDraft(emptyDraft); setAdding(false) }
  }

  async function removeFounder(id: string) {
    const data = await req(`${apiBase}/founders/${id}`, { method: "DELETE" }, `del-${id}`)
    if (data?.founders) onChange(data.founders)
  }

  async function makePrimary(id: string) {
    const data = await req(`${apiBase}/founders/${id}`, {
      method: "PATCH", body: JSON.stringify({ setPrimary: true }),
    }, `pri-${id}`)
    if (data?.founders) onChange(data.founders)
  }

  // The photo route returns only the updated founder; merge it into the list.
  function onPhotoUploaded(updated: DealFounder) {
    onChange(founders.map((f) => (f.id === updated.id ? updated : f)))
  }

  return (
    <div className="border border-foreground/10 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-lg">Founders</h3>
        {!readOnly && !adding && (
          <button onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full border border-foreground/15 hover:bg-foreground/5 text-sm">
            <UserPlus className="w-4 h-4" /> Add founder
          </button>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {founders.length === 0 && !adding && (
        <p className="text-sm text-muted-foreground">No founder profiles yet.</p>
      )}

      <div className="space-y-3">
        {founders.map((f) => (
          <div key={f.id} className="flex items-start gap-3 p-3 rounded-md border border-foreground/5 bg-foreground/[0.02]">
            <FounderAvatar apiBase={apiBase} founder={f} readOnly={readOnly}
              onUploaded={onPhotoUploaded} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-sm">{f.name}</span>
                {f.is_primary && (
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-700 bg-amber-500/5">
                    <Star className="w-3 h-3" /> Primary
                  </span>
                )}
                {f.role && <span className="text-xs text-muted-foreground">· {f.role}</span>}
                {f.ownership_pct != null && (
                  <span className="font-mono text-[10px] text-muted-foreground">· {f.ownership_pct}%</span>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                {f.email && <a href={`mailto:${f.email}`} className="hover:underline">{f.email}</a>}
                {f.linkedin_url && (
                  <a href={f.linkedin_url} target="_blank" rel="noopener noreferrer" className="hover:underline">LinkedIn</a>
                )}
              </div>
              {f.bio && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{f.bio}</p>}
            </div>
            {!readOnly && (
              <div className="flex items-center gap-1">
                {!f.is_primary && (
                  <button onClick={() => makePrimary(f.id)} disabled={busy === `pri-${f.id}`}
                    title="Make primary"
                    className="p-1.5 rounded-md hover:bg-foreground/5 text-muted-foreground disabled:opacity-50">
                    <Star className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => removeFounder(f.id)} disabled={busy === `del-${f.id}`}
                  title="Remove founder"
                  className="p-1.5 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive disabled:opacity-50">
                  {busy === `del-${f.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {adding && (
        <div className="mt-3 p-3 rounded-md border border-foreground/10 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="Name *" className="h-9 px-3 rounded-md border border-input bg-background text-sm" />
            <input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}
              placeholder="Role (CEO, CTO…)" className="h-9 px-3 rounded-md border border-input bg-background text-sm" />
            <input value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              placeholder="Email" className="h-9 px-3 rounded-md border border-input bg-background text-sm" />
            <input value={draft.linkedinUrl} onChange={(e) => setDraft({ ...draft, linkedinUrl: e.target.value })}
              placeholder="LinkedIn URL" className="h-9 px-3 rounded-md border border-input bg-background text-sm" />
            <input type="number" value={draft.ownershipPct} onChange={(e) => setDraft({ ...draft, ownershipPct: e.target.value })}
              placeholder="Ownership %" className="h-9 px-3 rounded-md border border-input bg-background text-sm font-mono" />
          </div>
          <textarea value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
            placeholder="Short bio" rows={2}
            className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm" />
          <div className="flex gap-2">
            <button onClick={addFounder} disabled={busy === "add"}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground text-background hover:bg-foreground/90 text-sm disabled:opacity-50">
              {busy === "add" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Save founder
            </button>
            <button onClick={() => { setAdding(false); setDraft(emptyDraft); setError(null) }}
              className="h-9 px-4 rounded-full border border-foreground/15 hover:bg-foreground/5 text-sm">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}

function FounderAvatar({
  apiBase, founder, readOnly, onUploaded,
}: {
  apiBase: string; founder: DealFounder; readOnly: boolean; onUploaded: (founder: DealFounder) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch(`${apiBase}/founders/${founder.id}/photo`, { method: "POST", body: fd })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.founder) onUploaded(data.founder)
    } finally { setBusy(false); if (inputRef.current) inputRef.current.value = "" }
  }

  const initials = founder.name.split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase()
  // Photos live in the private Blob store — always load through the admin
  // streaming route rather than the raw (non-public) blob URL.
  const photoSrc = founder.photo_url ? `/api/portfolio/deal-founders/${founder.id}/photo` : null
  return (
    <button type="button" disabled={readOnly || busy}
      onClick={() => inputRef.current?.click()}
      className="relative flex-shrink-0 w-11 h-11 rounded-full overflow-hidden border border-foreground/10 bg-foreground/5 flex items-center justify-center text-xs font-mono text-muted-foreground disabled:cursor-default"
      title={readOnly ? founder.name : "Upload photo"}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : photoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photoSrc} alt={founder.name} className="w-full h-full object-cover" />
      ) : initials}
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onFile} />
    </button>
  )
}

/* ── Data room ──────────────────────────────────────────────────────────── */

const humanSize = (n: number | null) =>
  n == null ? "" : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`

export function DataRoomSection({
  apiBase, dealId, documents, onChange, readOnly,
}: {
  apiBase: string
  dealId: string
  documents: DealDocument[]
  onChange: (list: DealDocument[]) => void
  readOnly: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [category, setCategory] = useState<DealDocCategory>("deck")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true); setError(null)
    try {
      // Direct client → private Blob upload (bypasses the 4.5 MB body limit),
      // authorized by the token-broker route.
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-")
      // Path prefix must be deal-documents/<dealId>/ — the broker enforces it.
      const blob = await upload(`deal-documents/${dealId}/${safeName}`, file, {
        access: "private", // decks/models are confidential — private Blob store
        handleUploadUrl: `${apiBase}/documents/upload`,
        contentType: file.type || undefined,
      })
      // Persist the metadata row.
      const res = await fetch(`${apiBase}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category, name: file.name, blobUrl: blob.url,
          contentType: file.type || null, size: file.size,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Upload failed (${res.status})`)
      if (data?.documents) onChange(data.documents)
    } catch (e: any) {
      setError(e?.message ?? "Upload failed")
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function remove(id: string) {
    setError(null)
    const res = await fetch(`${apiBase}/documents/${id}`, { method: "DELETE" })
    const data = await res.json().catch(() => ({}))
    if (res.ok && data?.documents) onChange(data.documents)
    else setError(data?.error ?? "Delete failed")
  }

  // Group by category, preserving the canonical category order.
  const grouped = DEAL_DOC_CATEGORIES
    .map((c) => ({ category: c, docs: documents.filter((d) => d.category === c) }))
    .filter((g) => g.docs.length > 0)

  return (
    <div className="border border-foreground/10 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <h3 className="font-display text-lg">Data room</h3>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <select value={category} onChange={(e) => setCategory(e.target.value as DealDocCategory)}
              className="h-9 px-2 rounded-md border border-input bg-background text-sm">
              {DEAL_DOC_CATEGORIES.map((c) => (
                <option key={c} value={c}>{DEAL_DOC_CATEGORY_LABELS[c]}</option>
              ))}
            </select>
            <button onClick={() => inputRef.current?.click()} disabled={busy}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full border border-foreground/15 hover:bg-foreground/5 text-sm disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {busy ? "Uploading…" : "Upload"}
            </button>
            <input ref={inputRef} type="file" hidden onChange={onFile} />
          </div>
        )}
      </div>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      {documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No documents uploaded yet. Upload the deck, financial model, cap table and legal docs here —
          required items are tracked in the stage requirements.
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <div key={g.category}>
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                {DEAL_DOC_CATEGORY_LABELS[g.category]}
              </p>
              <div className="space-y-1.5">
                {g.docs.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 p-2 rounded-md border border-foreground/5 bg-foreground/[0.02]">
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <a href={d.url} target="_blank" rel="noopener noreferrer"
                      className="flex-1 min-w-0 text-sm hover:underline truncate">{d.name}</a>
                    <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0">{humanSize(d.size)}</span>
                    {d.stage_at_upload && (
                      <span className="font-mono text-[10px] text-muted-foreground flex-shrink-0 hidden sm:inline">
                        · {STAGE_LABEL[d.stage_at_upload as DealStage] ?? d.stage_at_upload}
                      </span>
                    )}
                    {!readOnly && (
                      <button onClick={() => remove(d.id)} title="Delete document"
                        className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive flex-shrink-0">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
