"use client"

/**
 * Legal & Compliance — 94-field editor.
 *
 * Matches the reference screenshot:
 *   - Same dark canvas-style header with tab switcher + chrome
 *   - 36/94 approved progress bar (3-tone: Approved green / Filled
 *     amber / Empty grey) at the top
 *   - All / Empty / Filled / Approved filter chips
 *   - Document filter dropdown
 *   - Sections with field cards in a 3-column grid
 *   - Each card: source-document chips, input widget, Approve button
 *     with three states (Approve / Approved ✓ / Empty)
 *
 * Auto-saves edits debounced (800ms). Approval is one-shot — clicking
 * Approve fires immediately and surfaces the green ✓ + locks the card
 * border green.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import { useLegalFieldsWebMcp } from "@/components/webmcp/legal-fields-tools"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import {
  ArrowLeft, Lock, Send, LayoutGrid, ListChecks, FolderOpen,
  CheckCircle2, AlertTriangle, Loader2, Clock, Search, Sparkles, FileText,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type { DocumentDef } from "@/lib/portfolio/legal-catalogue"
import type {
  LegalFieldDef,
  LegalFieldSectionDef,
  LegalFieldInputType,
} from "@/lib/portfolio/legal-fields-taxonomy"
import type {
  LegalFieldsPayload,
  LegalFieldsCompletion,
  LegalFieldValues,
  LegalFieldApprovals,
  FieldStatus,
} from "@/lib/portfolio/legal-fields"
import type {
  LegalFieldsMeta,
  LegalGenerationMeta,
} from "@/lib/portfolio/legal-fields-generation"
import { describeComputed } from "@/lib/portfolio/legal-fields-compute"
import type { LegalReviewState } from "@/lib/portfolio/legal-reviews"
import { LegalSubmitToolbar } from "@/components/portfolio/legal-submit-toolbar"
import { FundEditorSaveBar } from "@/components/portfolio/fund-editor-save-bar"

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

type StatusFilter = "all" | "empty" | "filled" | "approved"

export function LegalFieldsClient({ payload, sections, catalogue, initialMeta, initialReviewState }: Props) {
  const { fund } = payload
  const [values, setValues] = useState<LegalFieldValues>(payload.values)
  const [approvals, setApprovals] = useState<LegalFieldApprovals>(payload.approvals)
  const [completion, setCompletion] = useState<LegalFieldsCompletion>(payload.completion)
  const [meta, setMeta] = useState<LegalFieldsMeta>(initialMeta ?? {})
  const [reviewState, setReviewState] = useState<LegalReviewState>(initialReviewState ?? DRAFT_FALLBACK)
  const isLocked = reviewState.currentStatus !== "draft"
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState<LegalFieldValues>({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [approvingKey, setApprovingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [docFilter, setDocFilter] = useState<string>("all")

  useLegalFieldsWebMcp({
    toggleApproval,
    generateField,
    approvalsMap: approvals as any,
    fundId: (payload as any)?.fundId ?? undefined,
  })
  const [search, setSearch] = useState("")
  const [highlightKey, setHighlightKey] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchParams = useSearchParams()

  // Phase-4 deep-link: /legal/fields?field=carried_interest jumps to the
  // card, scrolls it into view, and flashes a 2s emerald ring so the
  // user knows where the review viewer dropped them.
  useEffect(() => {
    const fieldKey = searchParams?.get("field")
    if (!fieldKey) return
    // Defer to next tick so the section list has rendered.
    const t = setTimeout(() => {
      const el = document.getElementById(`legal-field-${fieldKey}`)
      if (!el) return
      el.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlightKey(fieldKey)
      const clearT = setTimeout(() => setHighlightKey(null), 2200)
      return () => clearTimeout(clearT)
    }, 120)
    return () => clearTimeout(t)
  }, [searchParams])

  async function generateField(fieldKey: string) {
    setGenerating((g) => new Set(g).add(fieldKey))
    setError(null)
    try {
      // Flush pending edits so the prompt sees the latest input values.
      if (Object.keys(dirty).length > 0) await flush()
      const res = await fetch(`/api/portfolio/funds/${fund.id}/legal/fields/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldKeys: [fieldKey], regenerate: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Generation failed (${res.status})`)
      if (data.values) setValues(data.values)
      if (data.approvals) setApprovals(data.approvals)
      if (data.completion) setCompletion(data.completion)
      if (data.meta) setMeta(data.meta)
      const r = Array.isArray(data.results) ? data.results.find((x: any) => x.fieldKey === fieldKey) : null
      if (r?.error) setError(`${fieldKey}: ${r.error}`)
    } catch (e: any) {
      setError(e?.message ?? "Generation failed")
    } finally {
      setGenerating((g) => {
        const next = new Set(g)
        next.delete(fieldKey)
        return next
      })
    }
  }

  // Debounced auto-save (same pattern as the assessment editor).
  useEffect(() => {
    if (Object.keys(dirty).length === 0) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => { void flush() }, 800)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty])

  async function flush() {
    const patch = { ...dirty }
    if (Object.keys(patch).length === 0) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/legal/fields`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: patch }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      setValues(data.values ?? {})
      setApprovals(data.approvals ?? {})
      if (data.completion) setCompletion(data.completion)
      if (data.meta) setMeta(data.meta)
      setDirty((p) => {
        const next = { ...p }
        for (const k of Object.keys(patch)) delete next[k]
        return next
      })
      setSavedAt(new Date())
    } catch (e: any) {
      setError(e?.message ?? "Save failed")
    } finally {
      setSaving(false)
    }
  }

  function setField(key: string, value: any) {
    setValues((v) => ({ ...v, [key]: value }))
    setDirty((d) => ({ ...d, [key]: value }))
  }

  async function toggleApproval(key: string, approve: boolean) {
    setApprovingKey(key)
    setError(null)
    try {
      // Make sure pending edits are persisted BEFORE approving — otherwise
      // we'd approve a stale value.
      if (Object.keys(dirty).length > 0) await flush()
      const res = await fetch(`/api/portfolio/funds/${fund.id}/legal/fields/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldKey: key, approve }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Approval failed (${res.status})`)
      setValues(data.values ?? values)
      setApprovals(data.approvals ?? approvals)
      if (data.completion) setCompletion(data.completion)
      if (data.meta) setMeta(data.meta)
    } catch (e: any) {
      setError(e?.message ?? "Approval failed")
    } finally {
      setApprovingKey(null)
    }
  }

  // ── filtering ────────────────────────────────────────────────────────

  function fieldStatus(f: LegalFieldDef): FieldStatus {
    if (approvals[f.key]) return "approved"
    const has = isPresent(values[f.key]) || f.inputType === "computed"
    return has ? "filled" : "empty"
  }

  const q = search.trim().toLowerCase()
  function matches(f: LegalFieldDef): boolean {
    if (statusFilter !== "all" && fieldStatus(f) !== statusFilter) return false
    if (docFilter !== "all" && !f.documents.includes(docFilter)) return false
    if (q && !(
      f.label.toLowerCase().includes(q) ||
      f.key.toLowerCase().includes(q) ||
      (f.hint?.toLowerCase().includes(q) ?? false)
    )) return false
    return true
  }

  const visibleSections = useMemo(
    () => sections
      .map((s) => ({ ...s, fields: s.fields.filter(matches) }))
      .filter((s) => s.fields.length > 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, q, statusFilter, docFilter, values, approvals],
  )

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="border-b border-foreground/10 bg-background">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-3 flex flex-wrap items-center gap-3">
          <Link href="/dashboard/portfolio/fund" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-3.5 h-3.5" /> Fund
          </Link>
          <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
          <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Legal</span>
          <nav className="ml-4 inline-flex items-center gap-1 p-1 rounded-md border border-foreground/15 bg-foreground/5">
            <Tab href="/dashboard/portfolio/fund/legal" icon={<LayoutGrid className="w-3.5 h-3.5" />} label="Canvas" />
            <Tab href="/dashboard/portfolio/fund/legal/fields" icon={<ListChecks className="w-3.5 h-3.5" />} label="Fields" active />
            <Tab href="/dashboard/portfolio/fund/legal/documents" icon={<FolderOpen className="w-3.5 h-3.5" />} label="All Documents" />
          </nav>
          <div className="ml-auto inline-flex items-center gap-2 flex-wrap">
            <FundEditorSaveBar
              pendingCount={Object.keys(dirty).length}
              saving={saving}
              savedAt={savedAt}
              error={error}
              onSaveNow={() => { void flush() }}
              dirtyKeys={Object.keys(dirty)}
            />
            <LegalSubmitToolbar
              fundId={fund.id}
              state={reviewState}
              onStateChange={setReviewState}
            />
          </div>
        </div>
      </header>

      {/* Progress bar (Approved / Filled / Empty) */}
      <div className="border-b border-foreground/10 bg-background px-6 lg:px-8 py-3">
        <div className="max-w-[1600px] mx-auto flex items-center gap-3">
          <ApprovedBar completion={completion} />
          <span className="font-mono text-[10px] text-muted-foreground whitespace-nowrap">
            {completion.approved}/{completion.total} approved
          </span>
        </div>
        <div className="max-w-[1600px] mx-auto mt-1 flex items-center gap-4 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Approved</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500" /> Filled</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-foreground/30" /> Empty</span>
        </div>
      </div>

      {/* Filter bar */}
      <div className="border-b border-foreground/10 bg-background px-6 lg:px-8 py-3">
        <div className="max-w-[1600px] mx-auto flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/80" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search fields…"
              className="w-full h-8 pl-8 pr-2 text-xs rounded-md border border-foreground/15 bg-foreground/5 text-foreground placeholder:text-muted-foreground/70"
            />
          </div>
          <select
            value={docFilter}
            onChange={(e) => setDocFilter(e.target.value)}
            className="h-8 px-2 text-xs rounded-md border border-foreground/15 bg-foreground/5 text-foreground"
          >
            <option value="all" className="text-foreground">All Documents</option>
            {catalogue.map((d) => (
              <option key={d.key} value={d.key} className="text-foreground">{d.title}</option>
            ))}
          </select>
          <div className="ml-auto inline-flex items-center gap-1 text-xs">
            {(["all", "empty", "filled", "approved"] as StatusFilter[]).map((s) => {
              const n = s === "all" ? completion.total
                : s === "empty" ? completion.empty
                : s === "filled" ? Math.max(0, completion.filled - completion.approved)
                : completion.approved
              const active = statusFilter === s
              return (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={`px-2.5 h-8 rounded-md border font-medium ${active ? "bg-foreground text-background border-foreground" : "border-foreground/15 hover:bg-foreground/5"}`}
                >
                  {s === "all" ? "All" : s === "empty" ? "Empty" : s === "filled" ? "Filled" : "Approved"} <span className="font-mono text-[10px] opacity-70">({n})</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Sections + field grid */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-8 py-8 space-y-10">
        {isLocked && <LockedForReviewBanner state={reviewState} />}
        {payload.needsMigration ? (
          <MigrationBanner />
        ) : visibleSections.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-16">
            No fields match this filter.
          </div>
        ) : visibleSections.map((s) => {
          const sc = completion.bySection[s.key]
          return (
            <section key={s.key}>
              <header className="flex items-center gap-3 mb-4">
                <h2 className="font-display text-xl tracking-tight">{s.label}</h2>
                <span className="font-mono text-xs text-muted-foreground">{sc?.approved ?? 0}/{sc?.total ?? s.fields.length}</span>
                <div className="flex-1 h-px bg-foreground/10" />
              </header>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {s.fields.map((f) => (
                  <FieldCard
                    key={f.key}
                    field={f}
                    value={values[f.key]}
                    status={fieldStatus(f)}
                    catalogue={catalogue}
                    meta={meta[f.key]}
                    isApproving={approvingKey === f.key}
                    isGenerating={generating.has(f.key)}
                    isHighlighted={highlightKey === f.key}
                    computedDetail={
                      f.inputType === "computed"
                        ? describeComputed(f.key, values)
                        : null
                    }
                    onChange={(v) => setField(f.key, v)}
                    onApprove={(approve) => toggleApproval(f.key, approve)}
                    onGenerate={() => generateField(f.key)}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </main>
  )
}

// ── progress bar with three sub-bars ──────────────────────────────────-

function ApprovedBar({ completion }: { completion: LegalFieldsCompletion }) {
  const total = Math.max(1, completion.total)
  const approvedPct = (completion.approved / total) * 100
  const filledOnlyPct = (Math.max(0, completion.filled - completion.approved) / total) * 100
  return (
    <div className="flex-1 h-2 bg-foreground/10 rounded overflow-hidden flex">
      <div className="h-full bg-emerald-500 transition-all" style={{ width: `${approvedPct}%` }} />
      <div className="h-full bg-amber-500 transition-all" style={{ width: `${filledOnlyPct}%` }} />
    </div>
  )
}

// ── one field card ─────────────────────────────────────────────────────-

function FieldCard({
  field, value, status, catalogue, meta, isApproving, isGenerating, isHighlighted, computedDetail, onChange, onApprove, onGenerate,
}: {
  field: LegalFieldDef
  value: any
  status: FieldStatus
  catalogue: DocumentDef[]
  meta?: LegalGenerationMeta
  isApproving: boolean
  isGenerating: boolean
  isHighlighted: boolean
  computedDetail: { value: any; ready: boolean; formula: string; inputs: string[] } | null
  onChange: (v: any) => void
  onApprove: (approve: boolean) => void
  onGenerate: () => void
}) {
  const borderTone = status === "approved" ? "border-emerald-500"
    : status === "filled" ? "border-amber-500/60"
    : "border-foreground/15"
  const highlightRing = isHighlighted ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-foreground/5" : ""
  const docMap = useMemo(
    () => Object.fromEntries(catalogue.map((d) => [d.key, d])),
    [catalogue],
  )
  return (
    <div id={`legal-field-${field.key}`} className={`rounded-md border bg-foreground/[0.03] p-3.5 ${borderTone} ${highlightRing} transition-all`}>
      {/* Input + TBD label */}
      <div className="mb-3">
        <FieldInput
          field={field}
          value={value}
          meta={meta}
          isGenerating={isGenerating}
          computedDetail={computedDetail}
          disabled={isApproving}
          onChange={onChange}
          onGenerate={onGenerate}
        />
        {status === "empty" && field.inputType !== "computed" && (
          <div className="inline-flex items-center gap-1 mt-1.5 text-[10px] font-mono text-muted-foreground/80">
            <Clock className="w-3 h-3" /> TBD
          </div>
        )}
      </div>

      {/* Label + approval check + AI confidence badge */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className="text-sm font-medium leading-tight">
          {field.label}
          {field.required && <span className="text-rose-600 ml-1">*</span>}
        </h4>
        <div className="inline-flex items-center gap-1.5 shrink-0">
          {field.inputType === "generated" && meta?.confidence != null && (
            <span
              className="text-[10px] font-mono text-foreground/75"
              title={`AI confidence — generated ${meta.generated_at ? new Date(meta.generated_at).toLocaleString() : ""}`}
            >
              {Math.round(meta.confidence * 100)}%
            </span>
          )}
          {status === "approved" && <CheckCircle2 className="w-4 h-4 text-emerald-600" />}
        </div>
      </div>

      {field.hint && (
        <p className="text-[11px] text-muted-foreground mb-2 leading-relaxed line-clamp-2">{field.hint}</p>
      )}

      {/* Document badges */}
      {field.documents.length > 0 && (
        <div className="mb-2">
          <details className="group">
            <summary className="cursor-pointer text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground list-none flex items-center gap-1">
              <FileText className="w-3 h-3" />
              {field.documents.length} document{field.documents.length === 1 ? "" : "s"}
              <span className="opacity-60 group-open:rotate-180 transition-transform">▾</span>
            </summary>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {field.documents.map((dk) => (
                <Link
                  key={dk}
                  href={`/dashboard/portfolio/fund/legal/documents/${encodeURIComponent(dk)}`}
                  className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-indigo-500/10 text-indigo-700 border border-indigo-500/30 hover:bg-indigo-500/20 hover:text-indigo-800 transition-colors"
                  title={`Open ${docMap[dk]?.title ?? dk}`}
                >
                  {docMap[dk]?.shortTitle ?? dk}
                </Link>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Approve button */}
      {field.inputType === "computed" ? (
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono text-muted-foreground border border-foreground/15">
          <Lock className="w-3 h-3" /> Computed
        </div>
      ) : status === "approved" ? (
        <button
          onClick={() => onApprove(false)}
          disabled={isApproving}
          className="w-full h-8 rounded text-xs font-medium border border-emerald-500/30 bg-emerald-500/20 text-emerald-700 hover:bg-emerald-500/30 disabled:opacity-50"
        >
          {isApproving ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Approved · click to revert"}
        </button>
      ) : (
        <button
          onClick={() => onApprove(true)}
          disabled={isApproving || status === "empty"}
          className={`w-full h-8 rounded text-xs font-medium transition ${status === "filled"
            ? "bg-emerald-500 text-foreground hover:bg-emerald-400"
            : "bg-emerald-500/30 text-emerald-700/60 cursor-not-allowed"}`}
        >
          {isApproving ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : "Approve"}
        </button>
      )}
    </div>
  )
}

// ── per-input widget ───────────────────────────────────────────────────-

function FieldInput({
  field, value, meta, isGenerating, computedDetail, disabled, onChange, onGenerate,
}: {
  field: LegalFieldDef
  value: any
  meta?: LegalGenerationMeta
  isGenerating: boolean
  computedDetail: { value: any; ready: boolean; formula: string; inputs: string[] } | null
  disabled: boolean
  onChange: (v: any) => void
  onGenerate: () => void
}) {
  const base = "w-full h-8 px-2 text-xs rounded-md border border-foreground/15 bg-foreground/5 text-foreground placeholder:text-muted-foreground/70 disabled:opacity-50"
  switch (field.inputType) {
    case "text":
    case "email":
    case "phone":
      return (
        <input
          type={field.inputType === "email" ? "email" : field.inputType === "phone" ? "tel" : "text"}
          value={value ?? ""} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${field.label.toLowerCase()}…`}
          className={base}
        />
      )
    case "long_text":
      return (
        <textarea
          rows={3} value={value ?? ""} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter ${field.label.toLowerCase()}…`}
          className="w-full px-2 py-1.5 text-xs rounded-md border border-foreground/15 bg-foreground/5 text-foreground placeholder:text-muted-foreground/70 disabled:opacity-50"
        />
      )
    case "number":
    case "years":
    case "months":
    case "percent":
    case "currency":
    case "multiple":
      return (
        <div className="relative">
          <input
            type="number" step="any" value={value ?? ""} disabled={disabled}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className={`${base} pr-12`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground/80">
            {field.inputType === "percent" ? "%"
              : field.inputType === "years" ? "yr"
              : field.inputType === "months" ? "mo"
              : field.inputType === "currency" ? "$"
              : field.inputType === "multiple" ? "×"
              : ""}
          </span>
        </div>
      )
    case "ratio":
      return (
        <input type="text" value={value ?? ""} disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 2:1" className={base} />
      )
    case "date":
      return (
        <input type="date" disabled={disabled}
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={base} />
      )
    case "select":
      return (
        <select value={value ?? ""} disabled={disabled}
          onChange={(e) => onChange(e.target.value || null)} className={base}>
          <option value="" className="text-foreground">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o} className="text-foreground">{o}</option>)}
        </select>
      )
    case "yes_no":
      return (
        <div className="inline-flex gap-1 w-full">
          {[{ l: "Yes", v: true }, { l: "No", v: false }].map((opt) => {
            const active = value === opt.v
            return (
              <button
                key={opt.l} type="button" disabled={disabled}
                onClick={() => onChange(opt.v)}
                className={`flex-1 h-8 text-xs rounded border ${active ? "bg-emerald-500 text-foreground border-emerald-500" : "border-foreground/15 hover:bg-foreground/10"} disabled:opacity-50`}
              >{opt.l === "Yes" ? "✓ Yes" : "✕ No"}</button>
            )
          })}
        </div>
      )
    case "address": {
      const a = (value && typeof value === "object" ? value : {}) as any
      return (
        <div className="space-y-1">
          <input type="text" disabled={disabled} value={a.street ?? ""}
            onChange={(e) => onChange({ ...a, street: e.target.value })}
            placeholder="Street address" className={base} />
          <div className="grid grid-cols-2 gap-1">
            <input type="text" disabled={disabled} value={a.state ?? ""}
              onChange={(e) => onChange({ ...a, state: e.target.value })}
              placeholder="State" className={base} />
            <input type="text" disabled={disabled} value={a.city ?? ""}
              onChange={(e) => onChange({ ...a, city: e.target.value })}
              placeholder="City" className={base} />
          </div>
          <input type="text" disabled={disabled} value={a.zip ?? ""}
            onChange={(e) => onChange({ ...a, zip: e.target.value })}
            placeholder="ZIP code" className={base} />
        </div>
      )
    }
    case "generated": {
      const hasText = typeof value === "string" && value.trim().length > 0
      const conf = meta?.confidence
      const confPct = conf != null ? Math.round(conf * 100) : null
      const confTone = conf == null ? "bg-foreground/15"
        : conf >= 0.75 ? "bg-emerald-500"
        : conf >= 0.55 ? "bg-amber-500"
        : "bg-rose-500"
      return (
        <div className="space-y-1.5">
          <textarea
            rows={4}
            value={value ?? ""}
            disabled={disabled || isGenerating}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isGenerating ? "Generating…" : "Click Generate or type your own narrative"}
            className="w-full px-2 py-1.5 text-xs rounded-md border border-foreground/15 bg-foreground/5 text-foreground placeholder:text-muted-foreground/70 disabled:opacity-50"
          />
          {confPct != null && hasText && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-foreground/10 rounded overflow-hidden">
                <div className={`h-full transition-all ${confTone}`} style={{ width: `${confPct}%` }} />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground w-9 text-right">{confPct}%</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onGenerate}
              disabled={isGenerating || disabled}
              className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border border-foreground/15 rounded hover:bg-foreground/10 disabled:opacity-50"
              title={hasText ? "Regenerate this narrative" : "AI-generate from the assessment context"}
            >
              {isGenerating
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Sparkles className="w-3 h-3" />}
              {isGenerating ? "Generating…" : hasText ? "Regenerate" : "Generate"}
            </button>
            {meta?.generated_at && (
              <span className="text-[10px] font-mono text-muted-foreground/80">
                Last: {new Date(meta.generated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      )
    }
    case "computed": {
      const ready = computedDetail?.ready ?? false
      const displayValue = computedDetail?.value ?? value
      const formatted = displayValue == null
        ? "—"
        : typeof displayValue === "number"
          ? displayValue.toLocaleString("en-US", { maximumFractionDigits: 0 })
          : String(displayValue)
      return (
        <div className="space-y-1.5">
          <div
            className={`h-8 px-2 flex items-center text-xs rounded-md border bg-foreground/[0.02] font-mono ${ready ? "border-foreground/20 text-foreground" : "border-foreground/15 text-muted-foreground/80"}`}
            title={computedDetail?.formula}
          >
            {formatted}
          </div>
          {computedDetail && (
            <details className="group">
              <summary className="cursor-pointer text-[10px] font-mono text-muted-foreground/80 hover:text-foreground list-none flex items-center gap-1">
                <Lock className="w-3 h-3" />
                {ready ? "Computed" : "Set inputs to populate"}
                <span className="opacity-60 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <div className="mt-1.5 text-[10px] text-muted-foreground pl-4 leading-snug">
                <div className="mb-1"><span className="font-mono">{computedDetail.formula}</span></div>
                <div className="font-mono uppercase tracking-wider text-muted-foreground/80">Edit inputs:</div>
                <ul className="list-disc list-inside">
                  {computedDetail.inputs.map((k) => <li key={k}>{k}</li>)}
                </ul>
              </div>
            </details>
          )}
        </div>
      )
    }
    default:
      return <input type="text" value={value ?? ""} disabled={disabled}
        onChange={(e) => onChange(e.target.value)} className={base} />
  }
}

// ── helpers ─────────────────────────────────────────────────────────────-

function isPresent(v: any): boolean {
  if (v == null) return false
  if (typeof v === "string") return v.trim().length > 0
  if (typeof v === "number") return Number.isFinite(v)
  if (typeof v === "boolean") return true
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return Object.keys(v).some((k) => isPresent(v[k]))
  return Boolean(v)
}

function Tab({
  href, icon, label, active, hint,
}: { href: string; icon: React.ReactNode; label: string; active?: boolean; hint?: string }) {
  const cls = active ? "bg-background text-foreground" : "text-foreground/75 hover:bg-foreground/10"
  return (
    <Link href={href} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium ${cls}`} title={hint ? `${label} — ${hint}` : label}>
      {icon}{label}
    </Link>
  )
}

function LockedForReviewBanner({ state }: { state: LegalReviewState }) {
  // Inflight submission — block edits until the reviewer responds.
  // Notes are surfaced inline when a reviewer marked the submission
  // "needs_changes" so the operator sees the fix-list right here.
  const label = state.currentStatus === "submitted" ? "Submitted for legal review"
    : state.currentStatus === "in_review" ? "Currently in review"
    : state.currentStatus === "needs_changes" ? "Reviewer requested changes"
    : "Locked"
  const tone = state.currentStatus === "needs_changes"
    ? "border-amber-500/30 bg-amber-500/5 text-amber-700"
    : "border-violet-500/30 bg-violet-500/5 text-violet-700"
  return (
    <div className={`rounded-md border ${tone} p-3 flex items-start gap-3`}>
      <Lock className="w-4 h-4 mt-0.5 shrink-0" />
      <div className="flex-1 text-xs">
        <div className="font-medium">{label}</div>
        <div className="text-foreground/75 mt-0.5">
          Edits are disabled while a review is in flight. The legal team has a pinned snapshot of
          the {state.currentReview?.totalFields ?? 94} fields and {state.currentReview?.approvedFields ?? 0} approvals
          at submit time.
        </div>
        {state.currentReview?.reviewerNotes && (
          <div className="mt-2 px-2 py-1.5 rounded bg-foreground/5 border border-foreground/10 text-foreground/85 whitespace-pre-wrap">
            <span className="font-mono uppercase text-[10px] tracking-wider text-muted-foreground/80">Reviewer · </span>
            {state.currentReview.reviewerNotes}
          </div>
        )}
      </div>
    </div>
  )
}

function MigrationBanner() {
  return (
    <div className="max-w-2xl mx-auto py-16 text-center">
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 text-amber-700 text-xs font-mono uppercase tracking-wider mb-4">
        Migration pending
      </div>
      <h2 className="text-xl font-medium mb-2">Legal-field columns haven't been added yet.</h2>
      <p className="text-sm text-foreground/75 mb-6">
        Run the migration from your Mac. Field values + approvals will start persisting on the next page load.
      </p>
      <pre className="text-left text-xs font-mono bg-foreground/5 border border-foreground/15 rounded p-4 overflow-x-auto">
{`cd ~/anker
NEON_DATABASE_URL='…' \\
  node scripts/oneshot/run-funds-legal-fields-columns.mjs`}
      </pre>
    </div>
  )
}
