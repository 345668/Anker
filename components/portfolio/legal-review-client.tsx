"use client"

/**
 * Legal & Compliance — document review viewer.
 *
 * Phase-4 surface. Renders each of the 13 legal documents as a single
 * scrollable column with the document's fields inlined. Empty fields
 * appear as clickable TBD pills that deep-link back to the fields
 * editor (?field=<key>) — the editor scrolls + flashes an emerald ring
 * around the targeted card on mount.
 *
 * Layout matches the reference screenshots:
 *   - Dark canvas header (matches the canvas + fields editor)
 *   - Left sidebar with the 13 documents grouped by entity kind, each
 *     row showing a mini progress bar (Approved / Filled / Empty) and
 *     an N/M counter
 *   - Main column: selected document with section headers + per-field
 *     rows. Each row:
 *       label   |  value-or-TBD pill   |  status chip (✓/●/—)
 *   - Right summary card per document: counts + Approve-all CTA (link
 *     to editor with that doc's filter applied — phase 5 will turn this
 *     into a real "Submit for legal review" action)
 *
 * Read-only viewer — values change through the editor only. This
 * keeps the audit trail single-sourced and avoids two write paths.
 */

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, FileText, CheckCircle2, AlertCircle, Clock, Send,
  Building2, ChevronRight, ExternalLink, Lock, Sparkles,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type { DocumentDef, EntityKind } from "@/lib/portfolio/legal-catalogue"
import type {
  LegalFieldDef,
  LegalFieldSectionDef,
} from "@/lib/portfolio/legal-fields-taxonomy"
import type {
  LegalFieldsPayload,
  LegalFieldValues,
  LegalFieldApprovals,
  FieldStatus,
} from "@/lib/portfolio/legal-fields"
import type { LegalFieldsMeta } from "@/lib/portfolio/legal-fields-generation"
import type { LegalReviewState } from "@/lib/portfolio/legal-reviews"
import { LegalSubmitToolbar } from "@/components/portfolio/legal-submit-toolbar"

const DRAFT_FALLBACK: LegalReviewState = {
  currentStatus: "draft",
  currentReview: null,
  history: [],
  creditsBalance: 0,
  blockingFields: [],
  canSubmit: false,
}

interface Props {
  payload: LegalFieldsPayload
  sections: LegalFieldSectionDef[]
  catalogue: DocumentDef[]
  initialMeta?: LegalFieldsMeta
  initialReviewState?: LegalReviewState
}

// Order documents in roughly the formation chronology — MC first, then
// the GP that's a member of the MC, then the fund created by the GP.
const ENTITY_ORDER: EntityKind[] = ["management_company", "general_partner", "fund"]
const ENTITY_LABEL: Record<EntityKind, string> = {
  management_company: "Management Company",
  general_partner: "General Partner",
  fund: "Fund",
}

export function LegalReviewClient({ payload, sections, catalogue, initialMeta, initialReviewState }: Props) {
  const { fund, values, approvals } = payload
  const meta = initialMeta ?? {}
  const [reviewState, setReviewState] = useState<LegalReviewState>(initialReviewState ?? DRAFT_FALLBACK)
  // Build flat field index once.
  const allFields = useMemo<LegalFieldDef[]>(
    () => sections.flatMap((s) => s.fields),
    [sections],
  )
  const fieldByKey = useMemo(
    () => Object.fromEntries(allFields.map((f) => [f.key, f])),
    [allFields],
  )

  // Documents grouped by entity for the sidebar.
  const docsByEntity = useMemo(() => {
    const grouped: Record<EntityKind, DocumentDef[]> = {
      management_company: [],
      general_partner: [],
      fund: [],
    }
    for (const doc of catalogue) grouped[doc.entityKind].push(doc)
    return grouped
  }, [catalogue])

  // Per-document field+stats index. Stable shape used by both sidebar
  // tiles and the main pane.
  const docStats = useMemo(() => {
    const out: Record<string, {
      doc: DocumentDef
      fields: LegalFieldDef[]
      sectionLabel: Record<string, string>
      total: number
      approved: number
      filled: number
      empty: number
    }> = {}
    const sectionLabel: Record<string, string> = {}
    for (const s of sections) {
      for (const f of s.fields) sectionLabel[f.key] = s.label
    }
    for (const doc of catalogue) {
      const fields = allFields.filter((f) =>
        Array.isArray(f.documents) && f.documents.includes(doc.key),
      )
      let approved = 0, filled = 0, empty = 0
      for (const f of fields) {
        const s = statusFor(f, values, approvals)
        if (s === "approved") approved++
        else if (s === "filled") filled++
        else empty++
      }
      out[doc.key] = {
        doc, fields, sectionLabel,
        total: fields.length, approved, filled, empty,
      }
    }
    return out
  }, [catalogue, allFields, sections, values, approvals])

  // Pick the first document with any field as initial selection (skip
  // empties that have no field bindings — those land in phase 6 once
  // the templates exist).
  const firstNonEmpty = catalogue.find((d) => docStats[d.key]?.total > 0)
  const [selectedDocKey, setSelectedDocKey] = useState<string>(
    firstNonEmpty?.key ?? catalogue[0]?.key ?? "",
  )

  // Aggregate review-wide totals for the header progress bar.
  const overall = useMemo(() => {
    let approved = 0, filled = 0, total = 0
    for (const f of allFields) {
      total++
      const s = statusFor(f, values, approvals)
      if (s === "approved") approved++
      else if (s === "filled") filled++
    }
    return { approved, filled, empty: total - approved - filled, total }
  }, [allFields, values, approvals])

  return (
    <div className="min-h-screen bg-foreground/[0.97] text-background">
      {/* Canvas-style dark header */}
      <header className="border-b border-background/10 bg-foreground/95 backdrop-blur">
        <div className="px-6 py-3 flex items-center gap-4">
          <Link href="/dashboard/portfolio/fund/legal"
            className="inline-flex items-center gap-1 text-xs font-mono uppercase tracking-wider text-background/70 hover:text-background">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to canvas
          </Link>
          <div className="w-px h-5 bg-background/15" />
          <h1 className="text-sm font-medium">{fund.name}</h1>
          <span className="text-[10px] font-mono uppercase tracking-wider text-background/40 px-2 py-0.5 border border-background/15 rounded">
            Document Review
          </span>
          <div className="flex-1" />
          <LegalSubmitToolbar
            fundId={fund.id}
            state={reviewState}
            canPurchase
            compact
            onStateChange={setReviewState}
          />
          <Link href={`/dashboard/portfolio/fund/legal/fields`}
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-background/70 hover:text-background px-2 py-1 border border-background/15 rounded">
            Edit fields <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {/* Overall progress bar — same 3-tone treatment as editor */}
        <div className="px-6 pb-3 space-y-1.5">
          <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider">
            <span className="text-background/60">Documentation status</span>
            <span className="text-background/40">·</span>
            <span><span className="text-emerald-400">{overall.approved}</span> approved</span>
            <span><span className="text-amber-400">{overall.filled}</span> filled</span>
            <span><span className="text-background/40">{overall.empty}</span> empty</span>
            <span className="text-background/40">·</span>
            <span className="text-background/60">{overall.total} fields</span>
          </div>
          <div className="h-1.5 w-full bg-background/10 rounded overflow-hidden flex">
            <div className="h-full bg-emerald-500 transition-all"
              style={{ width: `${(overall.approved / Math.max(1, overall.total)) * 100}%` }} />
            <div className="h-full bg-amber-500 transition-all"
              style={{ width: `${(overall.filled / Math.max(1, overall.total)) * 100}%` }} />
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar — 13 docs grouped by entity */}
        <aside className="w-72 shrink-0 border-r border-background/10 bg-foreground/[0.98]">
          <div className="p-3">
            <h2 className="text-[10px] font-mono uppercase tracking-wider text-background/50 px-2 mb-2">
              Documents · {catalogue.length}
            </h2>
            {ENTITY_ORDER.map((kind) => {
              const docs = docsByEntity[kind]
              if (docs.length === 0) return null
              return (
                <div key={kind} className="mb-4">
                  <div className="flex items-center gap-1.5 px-2 mb-1.5 text-[10px] font-mono uppercase tracking-wider text-background/40">
                    <Building2 className="w-3 h-3" />
                    {ENTITY_LABEL[kind]} · {docs.length}
                  </div>
                  <div className="space-y-0.5">
                    {docs.map((doc) => {
                      const stats = docStats[doc.key]
                      const isSelected = selectedDocKey === doc.key
                      const isEmpty = stats.total === 0
                      const pctApproved = isEmpty ? 0 : (stats.approved / stats.total) * 100
                      const pctFilled = isEmpty ? 0 : (stats.filled / stats.total) * 100
                      return (
                        <button
                          key={doc.key}
                          type="button"
                          onClick={() => setSelectedDocKey(doc.key)}
                          className={`w-full text-left rounded px-2 py-2 transition-colors ${
                            isSelected ? "bg-background/10" : "hover:bg-background/5"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="text-xs leading-tight">
                              {doc.shortTitle ?? doc.title}
                            </div>
                            {!isEmpty && stats.approved === stats.total && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                            )}
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <div className="flex-1 h-1 bg-background/10 rounded overflow-hidden flex">
                              <div className="h-full bg-emerald-500" style={{ width: `${pctApproved}%` }} />
                              <div className="h-full bg-amber-500" style={{ width: `${pctFilled}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-background/50 w-12 text-right">
                              {isEmpty ? "TBD" : `${stats.approved}/${stats.total}`}
                            </span>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        </aside>

        {/* Main pane — selected document */}
        <main className="flex-1 px-8 py-6 max-w-5xl">
          {selectedDocKey && docStats[selectedDocKey] && (
            <DocumentPane
              stats={docStats[selectedDocKey]}
              fund={fund}
              values={values}
              approvals={approvals}
              meta={meta}
            />
          )}
        </main>
      </div>
    </div>
  )
}

// ── document pane ───────────────────────────────────────────────────────

function DocumentPane({
  stats, fund, values, approvals, meta,
}: {
  stats: {
    doc: DocumentDef
    fields: LegalFieldDef[]
    sectionLabel: Record<string, string>
    total: number
    approved: number
    filled: number
    empty: number
  }
  fund: FundFull
  values: LegalFieldValues
  approvals: LegalFieldApprovals
  meta: LegalFieldsMeta
}) {
  const { doc, fields, sectionLabel, total, approved, filled, empty } = stats

  // Group fields back by section so the pane reads like a TOC.
  const grouped = useMemo(() => {
    const buckets: Record<string, LegalFieldDef[]> = {}
    for (const f of fields) {
      const sec = sectionLabel[f.key] ?? "Other"
      ;(buckets[sec] ||= []).push(f)
    }
    return Object.entries(buckets)
  }, [fields, sectionLabel])

  const editorBase = `/dashboard/portfolio/fund/legal/fields`

  return (
    <div className="space-y-5">
      {/* Document header card */}
      <div className="rounded-lg border border-background/15 bg-background/[0.04] p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded bg-background/5 border border-background/10 grid place-items-center">
            <FileText className="w-5 h-5 text-background/60" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium leading-tight">{doc.title}</h2>
            {doc.description && (
              <p className="text-sm text-background/60 mt-1">{doc.description}</p>
            )}
            <div className="mt-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-background/50">
              <span className="px-1.5 py-0.5 border border-background/15 rounded">
                {ENTITY_LABEL[doc.entityKind]}
              </span>
              {doc.primarySection && (
                <span className="px-1.5 py-0.5 border border-background/15 rounded">
                  {doc.primarySection}
                </span>
              )}
              {doc.templateFile && (
                <span className="px-1.5 py-0.5 border border-background/15 rounded text-background/40">
                  Template: {doc.templateFile}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Per-document progress */}
        {total > 0 ? (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center gap-3 text-[11px] font-mono uppercase tracking-wider">
              <span><span className="text-emerald-400">{approved}</span> approved</span>
              <span><span className="text-amber-400">{filled}</span> filled</span>
              <span><span className="text-background/40">{empty}</span> empty</span>
              <span className="text-background/40 ml-auto">{total} fields</span>
            </div>
            <div className="h-1.5 w-full bg-background/10 rounded overflow-hidden flex">
              <div className="h-full bg-emerald-500" style={{ width: `${(approved / total) * 100}%` }} />
              <div className="h-full bg-amber-500" style={{ width: `${(filled / total) * 100}%` }} />
            </div>
          </div>
        ) : (
          <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-background/50">
            <Clock className="w-3 h-3" />
            No field bindings yet — template scaffolds land in phase 6.
          </div>
        )}
      </div>

      {/* Section-grouped field rows */}
      {grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed border-background/15 bg-background/[0.02] p-8 text-center">
          <p className="text-sm text-background/60">
            This document is a template-only artefact — it'll render once Phase 6 publishes the {doc.templateFile} scaffold.
          </p>
        </div>
      ) : (
        grouped.map(([secLabel, secFields]) => (
          <section key={secLabel} className="rounded-lg border border-background/15 bg-background/[0.02] overflow-hidden">
            <header className="px-4 py-2.5 bg-background/[0.04] border-b border-background/10">
              <h3 className="text-xs font-mono uppercase tracking-wider text-background/70">
                {secLabel} · {secFields.length}
              </h3>
            </header>
            <div className="divide-y divide-background/10">
              {secFields.map((field) => (
                <FieldReviewRow
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  status={statusFor(field, values, approvals)}
                  meta={meta[field.key]}
                  jumpHref={`${editorBase}?field=${encodeURIComponent(field.key)}`}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

// ── per-row renderer ────────────────────────────────────────────────────

function FieldReviewRow({
  field, value, status, meta, jumpHref,
}: {
  field: LegalFieldDef
  value: any
  status: FieldStatus
  meta?: { confidence: number; generated_at: string }
  jumpHref: string
}) {
  const empty = status === "empty"
  return (
    <div className="px-4 py-3 grid grid-cols-[1fr_2fr_auto] gap-4 items-start hover:bg-background/[0.02] transition-colors">
      <div>
        <div className="text-sm leading-tight">
          {field.label}
          {field.required && <span className="text-rose-400 ml-1">*</span>}
        </div>
        {field.hint && (
          <p className="text-[11px] text-background/45 mt-0.5 leading-snug">{field.hint}</p>
        )}
        {field.inputType === "computed" && (
          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono text-background/45">
            <Lock className="w-3 h-3" /> Computed
          </div>
        )}
        {field.inputType === "generated" && meta?.confidence != null && (
          <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono text-background/45">
            <Sparkles className="w-3 h-3" />
            AI · {Math.round(meta.confidence * 100)}%
          </div>
        )}
      </div>
      <div className="min-w-0">
        {empty ? (
          <Link
            href={jumpHref}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono uppercase tracking-wider border border-amber-500/30 bg-amber-500/10 text-amber-300 rounded hover:bg-amber-500/15 transition-colors"
            title="Jump to this field in the editor"
          >
            <Clock className="w-3 h-3" /> TBD
            <ExternalLink className="w-3 h-3 opacity-60" />
          </Link>
        ) : (
          <FieldValueDisplay field={field} value={value} />
        )}
      </div>
      <div className="pt-0.5">
        {status === "approved" ? (
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        ) : status === "filled" ? (
          <span className="inline-block w-2 h-2 rounded-full bg-amber-400" title="Awaiting approval" />
        ) : (
          <span className="inline-block w-2 h-2 rounded-full bg-background/20" title="Empty" />
        )}
      </div>
    </div>
  )
}

function FieldValueDisplay({ field, value }: { field: LegalFieldDef; value: any }) {
  if (value == null || value === "") {
    return <span className="text-xs text-background/40">—</span>
  }
  // Long prose (generated narratives) → render full text with prose
  // styling, capped at ~5 lines for the review pane.
  if (field.inputType === "long_text" || field.inputType === "generated") {
    const text = String(value)
    return (
      <p className="text-sm text-background/85 leading-relaxed whitespace-pre-wrap line-clamp-5">
        {text}
      </p>
    )
  }
  if (field.inputType === "yes_no") {
    return (
      <span className={`inline-flex items-center px-2 py-0.5 text-[11px] font-mono uppercase tracking-wider rounded border ${
        value === true || value === "yes"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : "border-background/15 bg-background/5 text-background/70"
      }`}>
        {value === true || value === "yes" ? "Yes" : "No"}
      </span>
    )
  }
  if (field.inputType === "currency") {
    const n = typeof value === "number" ? value : Number(value)
    if (Number.isFinite(n)) {
      const fmt = n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B`
        : n >= 1e6 ? `$${(n / 1e6).toFixed(0)}M`
        : n >= 1e3 ? `$${(n / 1e3).toFixed(0)}K`
        : `$${n}`
      return <span className="text-sm font-mono text-background/90">{fmt}</span>
    }
  }
  if (field.inputType === "percent") {
    return <span className="text-sm font-mono text-background/90">{value}%</span>
  }
  if (field.inputType === "ratio") {
    return <span className="text-sm font-mono text-background/90">{value}×</span>
  }
  if (field.inputType === "years") {
    return <span className="text-sm font-mono text-background/90">{value} yr</span>
  }
  if (field.inputType === "months") {
    return <span className="text-sm font-mono text-background/90">{value} mo</span>
  }
  if (field.inputType === "address" && typeof value === "object") {
    const a = value as Record<string, string>
    const parts = [a.line1, a.line2, a.city, a.region, a.postal, a.country].filter(Boolean)
    return <span className="text-sm text-background/85">{parts.join(", ")}</span>
  }
  if (field.inputType === "multiple" && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v: string, i: number) => (
          <span key={i} className="text-[11px] font-mono px-1.5 py-0.5 border border-background/15 bg-background/5 rounded">
            {v}
          </span>
        ))}
      </div>
    )
  }
  return <span className="text-sm text-background/85">{String(value)}</span>
}

// ── helpers ─────────────────────────────────────────────────────────────

function statusFor(field: LegalFieldDef, values: LegalFieldValues, approvals: LegalFieldApprovals): FieldStatus {
  const v = values[field.key]
  const filled = v != null && v !== "" && !(Array.isArray(v) && v.length === 0)
  if (!filled) return "empty"
  // Computed fields auto-approve once their inputs produce a value —
  // there's nothing for a human to vet. Generated and manually entered
  // values need a human approval row.
  if (field.inputType === "computed") return "approved"
  if (approvals[field.key]) return "approved"
  return "filled"
}
