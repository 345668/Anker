"use client"

/**
 * Fund-of-record save indicator — shared by the legal-fields editor
 * and the fund-assessment editor.
 *
 * These editors are the canonical place an operator keys in details
 * about their fund. Every keystroke flows into:
 *   1. The relevant JSONB column on funds (legal_fields / assessment)
 *   2. The corresponding canonical columns (funds.name, target_size,
 *      management_fee_pct, carry_pct, term_years, ...) via
 *      applyCanonicalToFund() in lib/portfolio/fund-canonical-sync.ts
 *   3. Every downstream surface that reads from funds.* — fund detail
 *      page, capital calls, distributions, LP reports, the rendered
 *      legal templates, the radial assessment wheel.
 *
 * The UX has to make all of that unmistakable. We render:
 *
 *   [• N unsaved changes]   [Save now]   Saved 30s ago • flows to ▾
 *
 * - "N unsaved" — clear pending count so the operator knows the system
 *   has the edits queued
 * - "Save now" — manual flush even though auto-save fires at 800ms,
 *   for users who don't trust silent saves
 * - "Saved Xs ago" — persistent relative timestamp (ticks every 5s)
 * - "flows to ▾" — expandable detail listing every canonical column
 *   the dirty patch touches, plus which downstream surfaces will pick
 *   it up
 * - beforeunload guard — browser warns before closing the tab while
 *   dirty
 * - failure recovery — on save error the dirty buffer stays and we
 *   surface the error so the operator can retry
 */

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, AlertTriangle, Loader2, Save, ArrowRight } from "lucide-react"

/**
 * Map of field_key → human-readable destination shown in the "flows
 * to" panel. Mirrors lib/portfolio/fund-canonical-sync.ts. Keep in
 * sync if you add a canonical column.
 */
const FLOW_TARGETS: Record<string, string[]> = {
  fund_name:              ["funds.name", "Fund detail page", "Capital calls", "Distributions", "LP reports", "All bound legal documents"],
  name:                   ["funds.name", "Fund detail page", "Capital calls", "Distributions", "LP reports"],
  target_fund_size:       ["funds.target_size", "Fund detail page", "LP rollup • % subscribed", "PPM • A&R LPA • Form D"],
  target_size:            ["funds.target_size", "Fund detail page", "LP rollup • % subscribed"],
  management_fee:         ["funds.management_fee_pct", "Fund detail page", "Form ADV • IMA • A&R LPA"],
  management_fee_pct:     ["funds.management_fee_pct", "Fund detail page"],
  carried_interest:       ["funds.carry_pct", "Fund detail page", "Waterfall in distributions", "PPM • A&R LPA"],
  carry_pct:              ["funds.carry_pct", "Fund detail page", "Waterfall in distributions"],
  fund_term:              ["funds.term_years", "Fund detail page", "A&R LPA"],
  term_years:             ["funds.term_years", "Fund detail page"],
  investment_period:      ["funds.investment_period_years", "Fund detail page", "Commitment-period dates (computed)"],
  investment_period_years:["funds.investment_period_years", "Fund detail page"],
  vintage_year:           ["funds.vintage_year", "Fund detail page"],
  currency:               ["funds.currency", "Fund detail page", "Capital calls", "Distributions"],
  fm_legal_name:          ["funds.manager_org", "Fund detail page", "Form ADV"],
  manager_org:            ["funds.manager_org", "Fund detail page"],
  thesis_statement:       ["funds.description", "Fund detail page • description", "PPM"],
  description:            ["funds.description", "Fund detail page"],
}

interface Props {
  /** Number of keys currently in the dirty buffer. */
  pendingCount: number
  /** True while a save request is in flight. */
  saving: boolean
  /** Last successful save timestamp, or null if never saved this session. */
  savedAt: Date | null
  /** Error from the last save attempt, or null. Stays surfaced until the next successful save. */
  error: string | null
  /** Manually trigger a flush. The component just signals — the parent owns the save fn. */
  onSaveNow: () => void
  /**
   * Field keys currently in the dirty buffer. Used to render the
   * "flows to" detail panel. Pass [] when not dirty.
   */
  dirtyKeys?: string[]
}

export function FundEditorSaveBar({
  pendingCount, saving, savedAt, error, onSaveNow, dirtyKeys = [],
}: Props) {
  // Re-render every 5s so "Saved 30s ago" stays fresh.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 5000)
    return () => clearInterval(t)
  }, [])
  void tick  // referenced only to invalidate the closure

  // beforeunload guard — only attached while dirty. Browsers ignore
  // the custom message in modern Chrome/Firefox/Safari, but the
  // "Unsaved changes" prompt still fires.
  useEffect(() => {
    if (pendingCount === 0) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ""  // Chrome
      return ""
    }
    window.addEventListener("beforeunload", handler)
    return () => window.removeEventListener("beforeunload", handler)
  }, [pendingCount])

  // Build the "flows to" union of destinations from dirty keys.
  const flowTargets = useMemo(() => {
    if (dirtyKeys.length === 0) return [] as string[]
    const all = new Set<string>()
    for (const k of dirtyKeys) {
      for (const target of FLOW_TARGETS[k] ?? []) all.add(target)
    }
    return Array.from(all)
  }, [dirtyKeys])

  const savedRelative = savedAt ? formatRelative(savedAt) : null
  const tone = error ? "rose" : pendingCount > 0 ? "amber" : "emerald"

  return (
    <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-md border text-xs ${
      tone === "rose"    ? "border-rose-500/30 bg-rose-500/5 text-rose-700"
      : tone === "amber" ? "border-amber-500/30 bg-amber-500/5 text-amber-700"
      : "border-emerald-500/30 bg-emerald-500/5 text-emerald-700"
    }`}>
      {error ? (
        <>
          <AlertTriangle className="w-3.5 h-3.5" />
          <span className="font-medium">Save failed</span>
          <span className="text-rose-600">— {error}</span>
          <button
            type="button"
            onClick={onSaveNow}
            className="ml-1 inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-rose-500/30 hover:bg-rose-500/10 font-medium"
          >
            Retry
          </button>
        </>
      ) : saving ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Saving {pendingCount > 0 ? `${pendingCount} field${pendingCount === 1 ? "" : "s"}` : "…"}</span>
        </>
      ) : pendingCount > 0 ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
          <span className="font-medium">{pendingCount} unsaved change{pendingCount === 1 ? "" : "s"}</span>
          <button
            type="button"
            onClick={onSaveNow}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/30 hover:bg-amber-500/10 font-medium"
            title="Auto-saves in 800ms — click to save immediately"
          >
            <Save className="w-3 h-3" /> Save now
          </button>
          {flowTargets.length > 0 && (
            <details className="group relative">
              <summary className="cursor-pointer list-none inline-flex items-center gap-0.5 hover:text-amber-900">
                flows to <span className="opacity-60 group-open:rotate-180 transition-transform">▾</span>
              </summary>
              <FlowPopover targets={flowTargets} />
            </details>
          )}
        </>
      ) : savedAt ? (
        <>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Saved {savedRelative}</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="w-3.5 h-3.5 opacity-60" />
          <span className="text-emerald-700/70">All saved</span>
        </>
      )}
    </div>
  )
}

// ─── flow-to popover ────────────────────────────────────────────────────-

function FlowPopover({ targets }: { targets: string[] }) {
  return (
    <div className="absolute right-0 mt-1.5 z-40 w-72 rounded-md border border-foreground/10 bg-background shadow-lg p-3 text-xs text-foreground/80 font-normal">
      <p className="font-mono uppercase tracking-wider text-[10px] text-muted-foreground mb-1.5">
        This save propagates to:
      </p>
      <ul className="space-y-1">
        {targets.map((t) => (
          <li key={t} className="flex items-center gap-1.5">
            <ArrowRight className="w-3 h-3 text-foreground/40 shrink-0" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground italic">
        Edits flow through funds.* columns to every downstream surface — fund detail, capital calls, LP reports, rendered legal templates.
      </p>
    </div>
  )
}

// ─── helpers ────────────────────────────────────────────────────────────

function formatRelative(d: Date): string {
  const secs = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000))
  if (secs < 5) return "just now"
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `at ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
}
