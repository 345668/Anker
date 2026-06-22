"use client"

/**
 * Fund assessment editor — flat form view.
 *
 * Renders the full 158-field taxonomy organised by domain → sub-category.
 * Each field gets the appropriate input widget based on its inputType:
 *   - text / long_text → input or textarea
 *   - number / years / percent / currency → number input with unit affordance
 *   - select → dropdown of the field's options
 *   - yes_no → tri-state pill (Yes / No / —)
 *   - date → native date input
 *   - range → two-number pair (min / max)
 *   - region → comma-separated text (phase 1; multi-select in phase 4)
 *   - multiple / ratio → number with the appropriate suffix label
 *   - generated → read-only textarea (AI generation lands in phase 3)
 *   - computed → read-only display (derived in lib/portfolio/fund-assessment.ts)
 *
 * Save behaviour: debounced auto-save 800ms after the last edit. PATCH
 * sends only the changed values; the server merges. The Strength score
 * + completion bars at the top re-render from the API response.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Save, Loader2, CheckCircle2, AlertTriangle, Sparkles, ChevronDown, ChevronRight, Search,
} from "lucide-react"
import type { FundFull } from "@/lib/portfolio/funds"
import type {
  DomainDef,
  SubCategoryDef,
  FieldDef,
  FieldTier,
} from "@/lib/portfolio/fund-assessment-taxonomy"
import type {
  AssessmentValues,
  AssessmentCompletion,
} from "@/lib/portfolio/fund-assessment"

interface Props {
  fund: FundFull
  taxonomy: DomainDef[]
  initialValues: AssessmentValues
  initialCompletion: AssessmentCompletion
}

const TIER_TONE: Record<FieldTier, string> = {
  critical: "text-emerald-700 border-emerald-700/30 bg-emerald-50 dark:text-emerald-300 dark:border-emerald-300/30 dark:bg-emerald-950/40",
  supporting: "text-amber-700 border-amber-700/30 bg-amber-50 dark:text-amber-300 dark:border-amber-300/30 dark:bg-amber-950/40",
  supplemental: "text-foreground/70 border-foreground/20 bg-foreground/5",
}
const TIER_LABEL: Record<FieldTier, string> = {
  critical: "Critical",
  supporting: "Supporting",
  supplemental: "Supplemental",
}

export function FundAssessmentClient({ fund, taxonomy, initialValues, initialCompletion }: Props) {
  const [values, setValues] = useState<AssessmentValues>(initialValues)
  const [completion, setCompletion] = useState<AssessmentCompletion>(initialCompletion)
  const [dirty, setDirty] = useState<Record<string, any>>({})  // pending writes
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounced auto-save — fires 800ms after the last edit when dirty has
  // any keys. Saves the entire dirty buffer; the server merges.
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
      const res = await fetch(`/api/portfolio/funds/${fund.id}/assessment`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: patch }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Save failed (${res.status})`)
      setValues(data.values ?? {})
      setCompletion(data.completion ?? completion)
      setDirty((p) => {
        // Only clear the keys we actually sent (in case the user typed
        // more during the round trip).
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

  function toggleCollapse(domKey: string) {
    setCollapsed((c) => ({ ...c, [domKey]: !c[domKey] }))
  }

  // Filter fields by free-text query (matches label, key, or hint).
  const q = query.trim().toLowerCase()
  function matches(f: FieldDef): boolean {
    if (!q) return true
    return (
      f.label.toLowerCase().includes(q) ||
      f.key.toLowerCase().includes(q) ||
      (f.hint?.toLowerCase().includes(q) ?? false)
    )
  }

  // Pre-filter sub-categories so empty ones (post-search) hide.
  const visible = useMemo(() => {
    return taxonomy.map((d) => ({
      ...d,
      subCategories: d.subCategories
        .map((s) => ({ ...s, fields: s.fields.filter(matches) }))
        .filter((s) => s.fields.length > 0),
    })).filter((d) => d.subCategories.length > 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taxonomy, q])

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-foreground/10 bg-foreground/[0.015]">
        <div className="max-w-7xl mx-auto px-6 lg:px-10 pt-6 pb-4">
          <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Link href="/dashboard/portfolio/fund" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to fund
            </Link>
            <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
            <span>{fund.name}</span>
            <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
            <span>Assessment</span>
            <div className="ml-auto inline-flex items-center gap-2">
              {error && (
                <span className="inline-flex items-center gap-1 text-rose-600">
                  <AlertTriangle className="w-3 h-3" /> {error}
                </span>
              )}
              {saving ? (
                <span className="inline-flex items-center gap-1 text-foreground/80">
                  <Loader2 className="w-3 h-3 animate-spin" /> Saving…
                </span>
              ) : savedAt ? (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <CheckCircle2 className="w-3 h-3" /> Saved
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-6">
            <div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-1">Strength</div>
              <div className="font-display text-5xl tracking-tight">{completion.strength}</div>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-1">/ 1000</div>
            </div>

            <div className="flex-1 min-w-[280px]">
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                Completion by tier
              </div>
              <div className="space-y-2">
                {(["critical", "supporting", "supplemental"] as FieldTier[]).map((t) => {
                  const f = completion.filled[t]
                  const total = completion.total[t]
                  const pct = total > 0 ? (f / total) * 100 : 0
                  return (
                    <div key={t} className="flex items-center gap-3 text-xs">
                      <span className={`w-24 inline-flex justify-center px-2 py-0.5 border rounded ${TIER_TONE[t]} text-[10px] font-mono uppercase`}>
                        {TIER_LABEL[t]}
                      </span>
                      <div className="flex-1 h-1.5 bg-foreground/10 rounded overflow-hidden">
                        <div
                          className="h-full bg-foreground transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground w-16 text-right">
                        {f}/{total}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Domain summary chips */}
          <div className="mt-5 flex flex-wrap gap-2">
            {taxonomy.map((d) => {
              const pct = Math.round((completion.domainCompletion[d.key] ?? 0) * 100)
              return (
                <a
                  key={d.key}
                  href={`#dom-${d.key}`}
                  className="inline-flex items-center gap-2 px-3 py-1.5 text-xs border border-foreground/15 rounded hover:bg-foreground/5"
                >
                  <span>{d.label}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{pct}%</span>
                </a>
              )
            })}
          </div>

          <div className="mt-4 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search fields…"
              className="w-full md:w-96 pl-9 pr-3 h-9 text-sm border border-foreground/15 rounded-md bg-background"
            />
          </div>
        </div>
      </header>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-6 lg:px-10 py-8 space-y-8">
        {visible.map((d) => {
          const isCollapsed = !!collapsed[d.key]
          const domPct = Math.round((completion.domainCompletion[d.key] ?? 0) * 100)
          return (
            <section key={d.key} id={`dom-${d.key}`} className="scroll-mt-32">
              <button
                onClick={() => toggleCollapse(d.key)}
                className="w-full flex items-center gap-3 mb-4 text-left"
              >
                {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                <h2 className="font-display text-2xl tracking-tight">{d.label}</h2>
                <span className="text-[11px] font-mono uppercase text-muted-foreground">
                  {domPct}%
                </span>
                <div className="flex-1 h-px bg-foreground/10" />
              </button>
              {!isCollapsed && (
                <div className="space-y-6">
                  {d.subCategories.map((s) => (
                    <SubCategorySection
                      key={`${d.key}:${s.key}`}
                      domKey={d.key}
                      sub={s}
                      values={values}
                      completion={completion}
                      onChange={setField}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}

// ── sub-category section ────────────────────────────────────────────────

function SubCategorySection({
  domKey, sub, values, completion, onChange,
}: {
  domKey: string
  sub: SubCategoryDef
  values: AssessmentValues
  completion: AssessmentCompletion
  onChange: (key: string, value: any) => void
}) {
  const pct = Math.round((completion.subCategoryCompletion[`${domKey}:${sub.key}`] ?? 0) * 100)
  // Group fields by tier for the section structure shown in the spec.
  const byTier: Record<FieldTier, FieldDef[]> = {
    critical: sub.fields.filter((f) => f.tier === "critical"),
    supporting: sub.fields.filter((f) => f.tier === "supporting"),
    supplemental: sub.fields.filter((f) => f.tier === "supplemental"),
  }
  return (
    <div className="border border-foreground/10 rounded-md bg-foreground/[0.015]">
      <div className="px-4 py-2.5 border-b border-foreground/10 flex items-center justify-between">
        <h3 className="font-medium text-sm">{sub.label}</h3>
        <span className="text-[10px] font-mono uppercase text-muted-foreground">{pct}%</span>
      </div>
      <div className="p-4 space-y-5">
        {(["critical", "supporting", "supplemental"] as FieldTier[]).map((t) => {
          const fields = byTier[t]
          if (fields.length === 0) return null
          return (
            <div key={t}>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                {TIER_LABEL[t]} ({fields.length})
              </div>
              <div className="grid md:grid-cols-2 gap-3">
                {fields.map((f) => (
                  <FieldRow
                    key={f.key}
                    field={f}
                    value={values[f.key]}
                    onChange={(v) => onChange(f.key, v)}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── one field ───────────────────────────────────────────────────────────

function FieldRow({
  field, value, onChange,
}: {
  field: FieldDef
  value: any
  onChange: (v: any) => void
}) {
  const id = `f-${field.key}`
  return (
    <label htmlFor={id} className="block">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium text-foreground">{field.label}</span>
        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${TIER_TONE[field.tier]}`}>
          {field.tier === "critical" ? "Crit" : field.tier === "supporting" ? "Supp" : "Suppl"}
        </span>
        {field.importance === "high" && (
          <span className="text-[9px] font-mono uppercase text-amber-600">High</span>
        )}
      </div>
      <FieldInput id={id} field={field} value={value} onChange={onChange} />
      {field.hint && (
        <div className="text-[10px] text-muted-foreground mt-1">{field.hint}</div>
      )}
    </label>
  )
}

function FieldInput({
  id, field, value, onChange,
}: {
  id: string
  field: FieldDef
  value: any
  onChange: (v: any) => void
}) {
  const baseCls = "w-full h-8 px-2 text-xs border border-foreground/15 rounded bg-background"
  switch (field.inputType) {
    case "text":
      return (
        <input
          id={id}
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseCls}
        />
      )
    case "long_text":
      return (
        <textarea
          id={id}
          rows={3}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs border border-foreground/15 rounded bg-background"
        />
      )
    case "number":
    case "years":
    case "percent":
    case "currency":
    case "multiple":
      return (
        <div className="relative">
          <input
            id={id}
            type="number"
            step="any"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className={`${baseCls} pr-10`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground pointer-events-none">
            {field.inputType === "percent" ? "%"
              : field.inputType === "years" ? "yr"
              : field.inputType === "currency" ? "$"
              : field.inputType === "multiple" ? "×"
              : ""}
          </span>
        </div>
      )
    case "ratio":
      return (
        <input
          id={id}
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. 2:1"
          className={baseCls}
        />
      )
    case "select":
      return (
        <select
          id={id}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={baseCls}
        >
          <option value="">—</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      )
    case "yes_no":
      return (
        <div className="inline-flex gap-1">
          {[
            { label: "Yes", val: true },
            { label: "No", val: false },
            { label: "—", val: null },
          ].map((opt) => {
            const active = value === opt.val
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => onChange(opt.val)}
                className={`px-2.5 h-8 text-xs border rounded ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "border-foreground/15 hover:bg-foreground/5"
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      )
    case "date":
      return (
        <input
          id={id}
          type="date"
          value={typeof value === "string" ? value.slice(0, 10) : ""}
          onChange={(e) => onChange(e.target.value || null)}
          className={baseCls}
        />
      )
    case "range": {
      const min = value && typeof value === "object" ? value.min ?? "" : ""
      const max = value && typeof value === "object" ? value.max ?? "" : ""
      return (
        <div className="grid grid-cols-2 gap-2">
          <input
            id={id}
            type="number"
            step="any"
            value={min}
            placeholder="Min"
            onChange={(e) => onChange({ min: e.target.value === "" ? null : Number(e.target.value), max: max === "" ? null : Number(max) })}
            className={baseCls}
          />
          <input
            type="number"
            step="any"
            value={max}
            placeholder="Max"
            onChange={(e) => onChange({ min: min === "" ? null : Number(min), max: e.target.value === "" ? null : Number(e.target.value) })}
            className={baseCls}
          />
        </div>
      )
    }
    case "region":
      // Phase 1: comma-separated text. Phase 4 will be a multi-select.
      return (
        <input
          id={id}
          type="text"
          value={Array.isArray(value) ? value.join(", ") : (value ?? "")}
          onChange={(e) => {
            const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
            onChange(list.length === 0 ? null : list)
          }}
          placeholder="Europe, US, MENA…"
          className={baseCls}
        />
      )
    case "generated":
      // Read-only placeholder; phase-3 adds the Generate button.
      return (
        <div className="space-y-1.5">
          <textarea
            id={id}
            rows={3}
            value={value ?? ""}
            readOnly
            placeholder="AI-generated — coming in phase 3"
            className="w-full px-2 py-1.5 text-xs border border-foreground/15 rounded bg-foreground/[0.02] text-muted-foreground italic"
          />
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border border-foreground/15 rounded text-muted-foreground opacity-60 cursor-not-allowed"
            title="AI generation lands in phase 3"
          >
            <Sparkles className="w-3 h-3" /> Generate
          </button>
        </div>
      )
    case "computed":
      // Read-only derived value from the storage layer.
      return (
        <div className="h-8 px-2 flex items-center text-xs border border-foreground/15 rounded bg-foreground/[0.02] font-mono text-muted-foreground">
          {formatComputed(value)}
        </div>
      )
    default:
      return (
        <input
          id={id}
          type="text"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className={baseCls}
        />
      )
  }
}

function formatComputed(v: any): string {
  if (v == null) return "—"
  if (typeof v === "number") {
    if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 })
    return String(v)
  }
  if (typeof v === "string") return v
  try { return JSON.stringify(v) } catch { return "—" }
}
