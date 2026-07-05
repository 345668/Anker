/**
 * Deal pipeline — pure constants & scoring helpers (NO database imports).
 *
 * This module is safe to import from client components. The DB-backed
 * functions live in ./deal-pipeline, which imports `pg`; importing anything
 * runtime (e.g. DEAL_CRITERIA) from that module drags the Postgres driver
 * into the browser bundle and breaks the build. Keep browser-shared,
 * side-effect-free values here.
 */

// ── stages ──────────────────────────────────────────────────────────────

export const DEAL_STAGES = [
  "sourced", "screened", "deep_dive", "ic_scheduled", "ic_approved",
  "term_sheet", "committed", "closed", "passed",
] as const
export type DealStage = (typeof DEAL_STAGES)[number]

/** Forward transitions. `passed` is reachable from any non-terminal stage. */
const NEXT: Record<DealStage, DealStage[]> = {
  sourced:      ["screened", "passed"],
  screened:     ["deep_dive", "passed"],
  deep_dive:    ["ic_scheduled", "passed"],
  ic_scheduled: ["ic_approved", "passed"],
  ic_approved:  ["term_sheet", "passed"],
  term_sheet:   ["committed", "passed"],
  committed:    ["closed", "passed"],
  closed:       [],
  passed:       [],
}

export function canTransition(from: DealStage, to: DealStage): boolean {
  return NEXT[from]?.includes(to) ?? false
}

// ── scorecard taxonomy ──────────────────────────────────────────────────
// Criteria live in code (like the assessment taxonomy) so they can evolve
// without migrations. Scores are 1–5; weights sum to 1.

export interface DealCriterion {
  key: string
  label: string
  weight: number
  hint: string
}

export const DEAL_CRITERIA: DealCriterion[] = [
  { key: "team",      label: "Team",            weight: 0.30, hint: "Founder-market fit, prior exits, velocity of execution." },
  { key: "market",    label: "Market",          weight: 0.20, hint: "TAM trajectory, timing, why-now." },
  { key: "product",   label: "Product & moat",  weight: 0.15, hint: "Differentiation, defensibility, technical depth." },
  { key: "traction",  label: "Traction",        weight: 0.15, hint: "Revenue/usage growth, retention, quality of demand." },
  { key: "thesis",    label: "Thesis fit",      weight: 0.10, hint: "Fit with fund thesis, check size, stage, geography." },
  { key: "valuation", label: "Valuation & terms", weight: 0.10, hint: "Entry price sanity vs. comparable rounds and exit math." },
]

export type ScoreMap = Record<string, { score: number; note?: string | null }>

export function weightedScore(scores: ScoreMap): number | null {
  let total = 0
  let weightUsed = 0
  for (const c of DEAL_CRITERIA) {
    const s = scores[c.key]?.score
    if (s == null || !Number.isFinite(Number(s))) continue
    total += Math.min(5, Math.max(1, Number(s))) * c.weight
    weightUsed += c.weight
  }
  if (weightUsed === 0) return null
  return Math.round((total / weightUsed) * 1000) / 1000
}
