"use client"

/**
 * Interactive radial wheel viewer for the fund assessment.
 *
 * Three states drive the SVG:
 *
 *   1. Overview — all 6 domain wedges visible. Each wedge is coloured by
 *      completion: green ≥75%, amber 50–75%, rose 25–50%, slate <25%.
 *      Centre shows the Strength score (0–1000) with the +N delta badge.
 *
 *   2. Domain-focused — clicking a wedge promotes that domain. Other
 *      wedges fade to 30% opacity. The selected wedge's sub-categories
 *      orbit out around it as clickable circle nodes. Each orbit node
 *      has a progress ring (stroke-dasharray) showing its own
 *      completion %.
 *
 *   3. Sub-category-focused — clicking an orbit node opens the right-
 *      side detail panel. The panel lists all fields in that sub-
 *      category, grouped by tier, with the same widgets as the flat
 *      form. Saving uses the same debounced PATCH.
 *
 * Phase 4.5 will add zoom/pan, undo/redo, and an inline search-fields
 * affordance. The screenshot's "Manage team" / "Feedback" buttons are
 * not wired yet — those land with the multi-team work in phase 5.
 *
 * Data flow mirrors the flat form: this component owns the editable
 * state (values/meta/completion) and the PATCH/generate pipelines.
 * That's intentional — phase 4 ships a self-contained wheel even
 * though there's some duplication with FundAssessmentClient. Phase 5
 * will extract the shared bits.
 */

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Save, Loader2, CheckCircle2, AlertTriangle, Sparkles,
  TrendingUp, TrendingDown, X, LayoutGrid, ChevronLeft, Search,
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
import type {
  AssessmentDelta,
  RecommendedField,
} from "@/lib/portfolio/fund-assessment-history"
import type {
  AssessmentMeta,
  GenerationMeta,
} from "@/lib/portfolio/fund-assessment-generation"

interface Props {
  fund: FundFull
  taxonomy: DomainDef[]
  initialValues: AssessmentValues
  initialCompletion: AssessmentCompletion
  initialDelta?: AssessmentDelta
  initialRecommendations?: RecommendedField[]
  initialMeta?: AssessmentMeta
}

const EMPTY_DELTA: AssessmentDelta = {
  strength: 0,
  domain: {},
  priorCapturedAt: null,
  priorLabel: null,
}

// ── geometry constants ────────────────────────────────────────────────

// Single source of truth for the SVG layout. All wedge / orbit / label
// positions derive from these — change the radius once and everything
// stays consistent.
const VIEWBOX = 800
const CX = VIEWBOX / 2
const CY = VIEWBOX / 2
const R_INNER = 100        // central Strength gauge radius
const R_OUTER = 280        // outer edge of the domain wedges
const R_ORBIT = 360        // distance for sub-category nodes
const ORBIT_R = 38         // sub-category node circle radius

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

// Map completion fraction → semantic colour. Tuned to match the
// reference screenshot's "fully green" / "amber wedge" / "rose wedge"
// state visuals.
function completionColor(pct: number): { fill: string; stroke: string; label: string } {
  if (pct >= 0.75) return { fill: "rgb(16 185 129 / 0.75)", stroke: "rgb(16 185 129)", label: "good" }     // emerald-500
  if (pct >= 0.50) return { fill: "rgb(101 163 13 / 0.60)", stroke: "rgb(101 163 13)", label: "moderate" } // lime-700
  if (pct >= 0.25) return { fill: "rgb(245 158 11 / 0.55)", stroke: "rgb(245 158 11)", label: "weak" }     // amber-500
  return { fill: "rgb(244 63 94 / 0.55)", stroke: "rgb(244 63 94)", label: "missing" }                     // rose-500
}

// ── main component ────────────────────────────────────────────────────

export function FundAssessmentWheelClient({
  fund, taxonomy, initialValues, initialCompletion,
  initialDelta, initialRecommendations, initialMeta,
}: Props) {
  // Shared editable state (same shape as the flat-form client).
  const [values, setValues] = useState<AssessmentValues>(initialValues)
  const [completion, setCompletion] = useState<AssessmentCompletion>(initialCompletion)
  const [delta, setDelta] = useState<AssessmentDelta>(initialDelta ?? EMPTY_DELTA)
  const [recommendations, setRecommendations] = useState<RecommendedField[]>(initialRecommendations ?? [])
  const [meta, setMeta] = useState<AssessmentMeta>(initialMeta ?? {})
  const [generating, setGenerating] = useState<Set<string>>(new Set())
  const [dirty, setDirty] = useState<Record<string, any>>({})
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Wheel-specific selection state.
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null)
  const [selectedSub, setSelectedSub] = useState<string | null>(null)  // "domainKey:subKey"

  // Debounced auto-save — identical pattern to FundAssessmentClient.
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
      if (data.delta) setDelta(data.delta)
      if (Array.isArray(data.recommendations)) setRecommendations(data.recommendations)
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

  async function generateField(fieldKey: string) {
    setError(null)
    setGenerating((g) => new Set(g).add(fieldKey))
    try {
      const res = await fetch(`/api/portfolio/funds/${fund.id}/assessment/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fieldKeys: [fieldKey], regenerate: true }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `Generation failed (${res.status})`)
      if (data.values) setValues(data.values)
      if (data.completion) setCompletion(data.completion)
      if (data.meta) setMeta(data.meta)
      const result = Array.isArray(data.results) ? data.results.find((r: any) => r.fieldKey === fieldKey) : null
      if (result?.error) setError(`${fieldKey}: ${result.error}`)
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

  // ── wedge geometry ────────────────────────────────────────────────

  // 6 wedges of 60° each, starting at the top (-90°).
  const wedges = useMemo(() => {
    const N = taxonomy.length
    const each = 360 / N
    return taxonomy.map((d, i) => {
      const startAngle = i * each - 90 - each / 2  // shift so wedge 0 is centred at top
      const endAngle = startAngle + each
      const midAngle = (startAngle + endAngle) / 2
      return {
        domain: d,
        startAngle,
        endAngle,
        midAngle,
        completionPct: completion.domainCompletion[d.key] ?? 0,
      }
    })
  }, [taxonomy, completion])

  // When a domain is selected, lay out its sub-categories along an arc.
  const orbitNodes = useMemo(() => {
    if (!selectedDomain) return []
    const wedge = wedges.find((w) => w.domain.key === selectedDomain)
    if (!wedge) return []
    const subs = wedge.domain.subCategories
    const N = subs.length
    // Arc span scales with the sub-category count (up to 120°).
    const arcSpan = Math.min(120, Math.max(30, N * 14))
    const start = wedge.midAngle - arcSpan / 2
    const step = N > 1 ? arcSpan / (N - 1) : 0
    return subs.map((s, i) => {
      const angle = N === 1 ? wedge.midAngle : start + i * step
      const { x, y } = polar(angle, R_ORBIT)
      return {
        sub: s,
        domain: wedge.domain,
        angle,
        x,
        y,
        completionPct: completion.subCategoryCompletion[`${wedge.domain.key}:${s.key}`] ?? 0,
      }
    })
  }, [selectedDomain, wedges, completion])

  const selectedSubDef = useMemo(() => {
    if (!selectedSub) return null
    const [domKey, subKey] = selectedSub.split(":")
    const dom = taxonomy.find((d) => d.key === domKey)
    if (!dom) return null
    const sub = dom.subCategories.find((s) => s.key === subKey)
    if (!sub) return null
    return { domain: dom, sub }
  }, [selectedSub, taxonomy])

  // ── render ─────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-foreground/10 bg-foreground/[0.015]">
        <div className="max-w-[1600px] mx-auto px-6 lg:px-10 pt-5 pb-4">
          <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
            <Link href="/dashboard/portfolio/fund" className="inline-flex items-center gap-1.5 hover:text-foreground">
              <ArrowLeft className="w-3.5 h-3.5" /> Back to fund
            </Link>
            <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
            <span>{fund.name}</span>
            <span aria-hidden className="w-1 h-1 rounded-full bg-foreground/30" />
            <span>Assessment · Wheel</span>
            <div className="ml-auto inline-flex items-center gap-3">
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
              <Link
                href="/dashboard/portfolio/fund/assessment"
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs border border-foreground/15 rounded hover:bg-foreground/5"
                title="Switch to the flat form view"
              >
                <LayoutGrid className="w-3.5 h-3.5" /> Form view
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Body — wheel on left, side panel slides in from right */}
      <div className="max-w-[1600px] mx-auto px-6 lg:px-10 py-6 grid lg:grid-cols-[1fr_360px] gap-6">

        {/* SVG canvas */}
        <div className="relative">
          <svg
            viewBox={`0 0 ${VIEWBOX} ${VIEWBOX}`}
            className="w-full h-auto max-h-[calc(100vh-180px)]"
            role="img"
            aria-label={`Fund-strength wheel for ${fund.name}`}
          >
            {/* Wedges */}
            {wedges.map((w) => {
              const isActive = selectedDomain === w.domain.key
              const isOther = selectedDomain != null && selectedDomain !== w.domain.key
              const c = completionColor(w.completionPct)
              return (
                <g
                  key={w.domain.key}
                  onClick={() => {
                    if (selectedDomain === w.domain.key) {
                      setSelectedDomain(null)
                      setSelectedSub(null)
                    } else {
                      setSelectedDomain(w.domain.key)
                      setSelectedSub(null)
                    }
                  }}
                  className="cursor-pointer transition-opacity duration-300"
                  style={{ opacity: isOther ? 0.28 : 1 }}
                >
                  <path
                    d={wedgePath(w.startAngle, w.endAngle, R_INNER + 10, R_OUTER)}
                    fill={c.fill}
                    stroke={isActive ? c.stroke : "rgb(0 0 0 / 0.12)"}
                    strokeWidth={isActive ? 3 : 1}
                  />
                  {/* Wedge label — placed along the wedge's arc midline */}
                  <DomainLabel
                    midAngle={w.midAngle}
                    label={w.domain.label}
                    completionPct={w.completionPct}
                  />
                </g>
              )
            })}

            {/* Central Strength gauge */}
            <circle cx={CX} cy={CY} r={R_INNER} fill="rgb(0 0 0 / 0.04)" stroke="rgb(0 0 0 / 0.18)" strokeWidth={2} />
            <text x={CX} y={CY - 12} textAnchor="middle" className="fill-foreground" style={{ fontSize: 48, fontWeight: 600 }}>
              {completion.strength}
            </text>
            <text x={CX} y={CY + 22} textAnchor="middle" className="fill-muted-foreground" style={{ fontSize: 12, letterSpacing: 2 }}>
              STRENGTH
            </text>
            {delta.strength !== 0 && (
              <text
                x={CX}
                y={CY + 44}
                textAnchor="middle"
                className={delta.strength > 0 ? "fill-emerald-700" : "fill-rose-700"}
                style={{ fontSize: 14, fontFamily: "monospace" }}
              >
                {delta.strength > 0 ? "+" : ""}{delta.strength}
              </text>
            )}

            {/* Orbit nodes — only when a domain is selected */}
            {orbitNodes.map((n) => {
              const key = `${n.domain.key}:${n.sub.key}`
              const isActive = selectedSub === key
              const c = completionColor(n.completionPct)
              const ringCircumference = 2 * Math.PI * (ORBIT_R - 2)
              const filled = ringCircumference * n.completionPct
              return (
                <g
                  key={key}
                  onClick={() => setSelectedSub(isActive ? null : key)}
                  className="cursor-pointer"
                >
                  {/* Connector line from wedge to orbit node */}
                  <line
                    x1={polar(n.angle, R_OUTER).x}
                    y1={polar(n.angle, R_OUTER).y}
                    x2={n.x}
                    y2={n.y}
                    stroke="rgb(0 0 0 / 0.15)"
                    strokeWidth={1}
                    strokeDasharray="2 3"
                  />
                  {/* Background ring */}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={ORBIT_R - 2}
                    fill="rgb(255 255 255)"
                    stroke="rgb(0 0 0 / 0.1)"
                    strokeWidth={3}
                  />
                  {/* Progress ring (stroke-dasharray reveals % completion) */}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={ORBIT_R - 2}
                    fill="transparent"
                    stroke={c.stroke}
                    strokeWidth={3}
                    strokeDasharray={`${filled} ${ringCircumference - filled}`}
                    strokeLinecap="round"
                    transform={`rotate(-90 ${n.x} ${n.y})`}
                  />
                  {/* Filled core when selected */}
                  {isActive && (
                    <circle cx={n.x} cy={n.y} r={ORBIT_R - 8} fill={c.fill} opacity={0.4} />
                  )}
                  {/* Label */}
                  <foreignObject
                    x={n.x - ORBIT_R + 4}
                    y={n.y - ORBIT_R + 4}
                    width={(ORBIT_R - 4) * 2}
                    height={(ORBIT_R - 4) * 2}
                  >
                    <div className="w-full h-full flex items-center justify-center text-center leading-tight" style={{ fontSize: 11, fontWeight: 500 }}>
                      <span className="text-foreground px-1">{n.sub.label}</span>
                    </div>
                  </foreignObject>
                </g>
              )
            })}
          </svg>

          {/* Floating reset button when something is selected */}
          {(selectedDomain || selectedSub) && (
            <button
              onClick={() => { setSelectedDomain(null); setSelectedSub(null) }}
              className="absolute top-2 left-2 inline-flex items-center gap-1 px-2.5 py-1.5 text-xs border border-foreground/15 rounded-md bg-background hover:bg-foreground/5"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Reset
            </button>
          )}
        </div>

        {/* Side panel */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          {selectedSubDef ? (
            <SubCategoryDetail
              fund={fund}
              domain={selectedSubDef.domain}
              sub={selectedSubDef.sub}
              values={values}
              meta={meta}
              generating={generating}
              onChange={setField}
              onGenerate={generateField}
              onClose={() => setSelectedSub(null)}
            />
          ) : selectedDomain ? (
            <DomainOverviewPanel
              taxonomy={taxonomy}
              domainKey={selectedDomain}
              completion={completion}
              delta={delta}
              onPickSub={(k) => setSelectedSub(k)}
            />
          ) : (
            <OverviewPanel
              taxonomy={taxonomy}
              completion={completion}
              delta={delta}
              recommendations={recommendations}
              onPickDomain={(k) => setSelectedDomain(k)}
            />
          )}
        </aside>
      </div>
    </main>
  )
}

// ── side-panel variants ───────────────────────────────────────────────

function OverviewPanel({
  taxonomy, completion, delta, recommendations, onPickDomain,
}: {
  taxonomy: DomainDef[]
  completion: AssessmentCompletion
  delta: AssessmentDelta
  recommendations: RecommendedField[]
  onPickDomain: (key: string) => void
}) {
  return (
    <div className="space-y-4">
      <div className="border border-foreground/10 rounded-md bg-foreground/[0.015]">
        <div className="px-4 py-2.5 border-b border-foreground/10">
          <h3 className="font-medium text-sm">Domain completion</h3>
          {delta.priorLabel && (
            <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
              Compared to {delta.priorLabel}
            </div>
          )}
        </div>
        <div className="p-3 space-y-1">
          {taxonomy.map((d) => {
            const pct = Math.round((completion.domainCompletion[d.key] ?? 0) * 100)
            const dDelta = delta.domain[d.key] ?? 0
            const dDeltaPct = Math.round(dDelta * 100)
            return (
              <button
                key={d.key}
                onClick={() => onPickDomain(d.key)}
                className="w-full flex items-center gap-3 px-2 py-1.5 rounded hover:bg-foreground/5 text-left"
              >
                <span className="text-xs font-medium flex-1 truncate">{d.label}</span>
                <span className="font-mono text-[10px] text-muted-foreground">{pct}%</span>
                {dDeltaPct !== 0 && (
                  <span className={`font-mono text-[10px] ${dDeltaPct > 0 ? "text-emerald-700" : "text-rose-700"}`}>
                    {dDeltaPct > 0 ? "+" : ""}{dDeltaPct}%
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border border-foreground/10 rounded-md bg-foreground/[0.015]">
        <div className="px-4 py-2.5 border-b border-foreground/10 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-foreground/70" />
          <h3 className="font-medium text-sm">Next-best fields</h3>
        </div>
        <div className="p-3 space-y-2">
          {recommendations.length === 0 ? (
            <div className="text-xs text-muted-foreground px-2 py-3 text-center">
              Every field is filled. Strength is at its max.
            </div>
          ) : (
            recommendations.slice(0, 5).map((r) => (
              <div key={r.fieldKey} className="px-2 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium line-clamp-1">{r.fieldLabel}</span>
                  <span className="font-mono text-[10px] text-emerald-700 whitespace-nowrap">
                    +{r.estimatedPointsGain.toFixed(1)}
                  </span>
                </div>
                <div className="text-[10px] font-mono text-muted-foreground mt-0.5 uppercase">
                  {r.tier} · {r.subLabel}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function DomainOverviewPanel({
  taxonomy, domainKey, completion, delta, onPickSub,
}: {
  taxonomy: DomainDef[]
  domainKey: string
  completion: AssessmentCompletion
  delta: AssessmentDelta
  onPickSub: (key: string) => void
}) {
  const dom = taxonomy.find((d) => d.key === domainKey)
  if (!dom) return null
  const pct = Math.round((completion.domainCompletion[domainKey] ?? 0) * 100)
  const dDelta = Math.round((delta.domain[domainKey] ?? 0) * 100)
  return (
    <div className="border border-foreground/10 rounded-md bg-foreground/[0.015]">
      <div className="px-4 py-3 border-b border-foreground/10">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          Domain
        </div>
        <h3 className="font-display text-lg tracking-tight mt-1 flex items-center gap-3">
          {dom.label}
          <span className="font-mono text-xs text-muted-foreground">{pct}%</span>
          {dDelta !== 0 && (
            <span className={`font-mono text-xs ${dDelta > 0 ? "text-emerald-700" : "text-rose-700"}`}>
              {dDelta > 0 ? "+" : ""}{dDelta}%
            </span>
          )}
        </h3>
        <div className="text-[11px] text-muted-foreground mt-1">
          Tap a sub-category in the wheel to edit fields.
        </div>
      </div>
      <div className="p-3 space-y-1">
        {dom.subCategories.map((s) => {
          const subPct = Math.round((completion.subCategoryCompletion[`${dom.key}:${s.key}`] ?? 0) * 100)
          return (
            <button
              key={s.key}
              onClick={() => onPickSub(`${dom.key}:${s.key}`)}
              className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded hover:bg-foreground/5 text-left"
            >
              <span className="text-xs font-medium flex-1 truncate">{s.label}</span>
              <span className="font-mono text-[10px] text-muted-foreground">{subPct}%</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function SubCategoryDetail({
  fund, domain, sub, values, meta, generating, onChange, onGenerate, onClose,
}: {
  fund: FundFull
  domain: DomainDef
  sub: SubCategoryDef
  values: AssessmentValues
  meta: AssessmentMeta
  generating: Set<string>
  onChange: (key: string, value: any) => void
  onGenerate: (key: string) => Promise<void>
  onClose: () => void
}) {
  const byTier: Record<FieldTier, FieldDef[]> = {
    critical: sub.fields.filter((f) => f.tier === "critical"),
    supporting: sub.fields.filter((f) => f.tier === "supporting"),
    supplemental: sub.fields.filter((f) => f.tier === "supplemental"),
  }
  return (
    <div className="border border-foreground/10 rounded-md bg-background max-h-[calc(100vh-160px)] overflow-y-auto">
      <div className="px-4 py-3 border-b border-foreground/10 sticky top-0 bg-background/95 backdrop-blur z-10 flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {domain.label}
          </div>
          <h3 className="font-display text-lg tracking-tight mt-0.5">{sub.label}</h3>
        </div>
        <button onClick={onClose} className="p-1 rounded hover:bg-foreground/5">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="p-3 space-y-5">
        {(["critical", "supporting", "supplemental"] as FieldTier[]).map((t) => {
          const fields = byTier[t]
          if (fields.length === 0) return null
          return (
            <div key={t}>
              <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
                {TIER_LABEL[t]} ({fields.length})
              </div>
              <div className="space-y-3">
                {fields.map((f) => (
                  <FieldRowWheel
                    key={f.key}
                    field={f}
                    value={values[f.key]}
                    meta={meta[f.key]}
                    isGenerating={generating.has(f.key)}
                    onChange={(v) => onChange(f.key, v)}
                    onGenerate={() => onGenerate(f.key)}
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

// ── field row (minimal version embedded in the wheel side panel) ───────

function FieldRowWheel({
  field, value, meta, isGenerating, onChange, onGenerate,
}: {
  field: FieldDef
  value: any
  meta?: GenerationMeta
  isGenerating: boolean
  onChange: (v: any) => void
  onGenerate: () => void
}) {
  const id = `wf-${field.key}`
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-medium">{field.label}</span>
        <span className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border ${TIER_TONE[field.tier]}`}>
          {field.tier === "critical" ? "Crit" : field.tier === "supporting" ? "Supp" : "Suppl"}
        </span>
        {field.importance === "high" && (
          <span className="text-[9px] font-mono uppercase text-amber-600">High</span>
        )}
        {field.inputType === "generated" && meta?.confidence != null && (
          <span className="text-[9px] font-mono uppercase text-muted-foreground ml-auto">
            {Math.round(meta.confidence * 100)}%
          </span>
        )}
      </div>
      <FieldInputWheel
        id={id}
        field={field}
        value={value}
        meta={meta}
        isGenerating={isGenerating}
        onChange={onChange}
        onGenerate={onGenerate}
      />
      {field.hint && (
        <div className="text-[10px] text-muted-foreground mt-1">{field.hint}</div>
      )}
    </div>
  )
}

function FieldInputWheel({
  id, field, value, meta, isGenerating, onChange, onGenerate,
}: {
  id: string
  field: FieldDef
  value: any
  meta?: GenerationMeta
  isGenerating: boolean
  onChange: (v: any) => void
  onGenerate: () => void
}) {
  const baseCls = "w-full h-8 px-2 text-xs border border-foreground/15 rounded bg-background"
  switch (field.inputType) {
    case "text":
      return <input id={id} type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={baseCls} />
    case "long_text":
      return (
        <textarea
          id={id} rows={3} value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs border border-foreground/15 rounded bg-background"
        />
      )
    case "number": case "years": case "percent": case "currency": case "multiple":
      return (
        <div className="relative">
          <input
            id={id} type="number" step="any" value={value ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className={`${baseCls} pr-10`}
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono text-muted-foreground">
            {field.inputType === "percent" ? "%" : field.inputType === "years" ? "yr" : field.inputType === "currency" ? "$" : field.inputType === "multiple" ? "×" : ""}
          </span>
        </div>
      )
    case "ratio":
      return <input id={id} type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="e.g. 2:1" className={baseCls} />
    case "select":
      return (
        <select id={id} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)} className={baseCls}>
          <option value="">—</option>
          {(field.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )
    case "yes_no":
      return (
        <div className="inline-flex gap-1">
          {[{ label: "Yes", v: true }, { label: "No", v: false }, { label: "—", v: null }].map((opt) => {
            const active = value === opt.v
            return (
              <button
                key={opt.label}
                type="button"
                onClick={() => onChange(opt.v)}
                className={`px-2.5 h-8 text-xs border rounded ${active ? "bg-foreground text-background border-foreground" : "border-foreground/15 hover:bg-foreground/5"}`}
              >{opt.label}</button>
            )
          })}
        </div>
      )
    case "date":
      return (
        <input
          id={id} type="date"
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
            id={id} type="number" step="any" value={min} placeholder="Min"
            onChange={(e) => onChange({ min: e.target.value === "" ? null : Number(e.target.value), max: max === "" ? null : Number(max) })}
            className={baseCls}
          />
          <input
            type="number" step="any" value={max} placeholder="Max"
            onChange={(e) => onChange({ min: min === "" ? null : Number(min), max: e.target.value === "" ? null : Number(e.target.value) })}
            className={baseCls}
          />
        </div>
      )
    }
    case "region":
      return (
        <input
          id={id} type="text"
          value={Array.isArray(value) ? value.join(", ") : (value ?? "")}
          onChange={(e) => {
            const list = e.target.value.split(",").map((s) => s.trim()).filter(Boolean)
            onChange(list.length === 0 ? null : list)
          }}
          placeholder="Europe, US…" className={baseCls}
        />
      )
    case "generated": {
      const hasText = typeof value === "string" && value.trim().length > 0
      const conf = meta?.confidence
      const confPct = conf != null ? Math.round(conf * 100) : null
      const confTone = conf == null ? "bg-foreground/20"
        : conf >= 0.75 ? "bg-emerald-600"
        : conf >= 0.55 ? "bg-amber-500"
        : "bg-rose-500"
      return (
        <div className="space-y-1.5">
          <textarea
            id={id} rows={4} value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={isGenerating ? "Generating…" : "Click Generate or type your own"}
            disabled={isGenerating}
            className={`w-full px-2 py-1.5 text-xs border border-foreground/15 rounded bg-background ${isGenerating ? "opacity-50" : ""}`}
          />
          {confPct != null && hasText && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1 bg-foreground/10 rounded overflow-hidden">
                <div className={`h-full transition-all ${confTone}`} style={{ width: `${confPct}%` }} />
              </div>
              <span className="text-[10px] font-mono text-muted-foreground w-10 text-right">{confPct}%</span>
            </div>
          )}
          <button
            type="button" onClick={onGenerate} disabled={isGenerating}
            className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono border border-foreground/15 rounded hover:bg-foreground/5 disabled:opacity-50"
          >
            {isGenerating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
            {isGenerating ? "Generating…" : hasText ? "Regenerate" : "Generate"}
          </button>
        </div>
      )
    }
    case "computed":
      return (
        <div className="h-8 px-2 flex items-center text-xs border border-foreground/15 rounded bg-foreground/[0.02] font-mono text-muted-foreground">
          {value == null ? "—" : (typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : String(value))}
        </div>
      )
    default:
      return <input id={id} type="text" value={value ?? ""} onChange={(e) => onChange(e.target.value)} className={baseCls} />
  }
}

// ── SVG helpers ─────────────────────────────────────────────────────────

function polar(angleDeg: number, r: number): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) }
}

function wedgePath(startAngle: number, endAngle: number, rInner: number, rOuter: number): string {
  const p1 = polar(startAngle, rOuter)
  const p2 = polar(endAngle, rOuter)
  const p3 = polar(endAngle, rInner)
  const p4 = polar(startAngle, rInner)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return [
    `M ${p1.x} ${p1.y}`,
    `A ${rOuter} ${rOuter} 0 ${largeArc} 1 ${p2.x} ${p2.y}`,
    `L ${p3.x} ${p3.y}`,
    `A ${rInner} ${rInner} 0 ${largeArc} 0 ${p4.x} ${p4.y}`,
    "Z",
  ].join(" ")
}

function DomainLabel({
  midAngle, label, completionPct,
}: {
  midAngle: number
  label: string
  completionPct: number
}) {
  // Position label along the wedge arc, roughly 70% of the way between
  // the inner and outer radii. Rotate text upright (no upside-down).
  const r = (R_INNER + R_OUTER) / 2 + 20
  const { x, y } = polar(midAngle, r)
  const lines = label.split(/\s*&\s*|\s+/g)
  const pct = Math.round(completionPct * 100)
  return (
    <g pointerEvents="none">
      <text
        x={x}
        y={y - (lines.length - 1) * 8}
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: 14, fontWeight: 600 }}
      >
        {lines.map((ln, i) => (
          <tspan key={i} x={x} dy={i === 0 ? 0 : 16}>{ln}</tspan>
        ))}
      </text>
      <text
        x={x}
        y={y + lines.length * 8 + 14}
        textAnchor="middle"
        className="fill-muted-foreground"
        style={{ fontSize: 11, fontFamily: "monospace" }}
      >
        {pct}%
      </text>
    </g>
  )
}
