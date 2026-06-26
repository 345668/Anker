/**
 * Fund-assessment storage layer.
 *
 * Values for the 158-field taxonomy (lib/portfolio/fund-assessment-taxonomy.ts)
 * are stored as a single jsonb blob on funds.assessment. Keys match the
 * field slugs from the taxonomy. This keeps phase-1 schema-flexible — we
 * can add fields in TS without writing a migration each time.
 *
 * Read: getAssessment(fundId) → { values: {key: any}, completion: ... }
 * Write: patchAssessment(fundId, patch) merges the patch object into the
 *        existing values, returns the merged values.
 *
 * Computed fields (e.g. management_fee_dollars = management_fee × target_fund_size)
 * are derived on read so they always reflect the latest inputs. They are
 * NOT stored to disk.
 *
 * Schema-drift guard: getAssessment tolerates the column being absent and
 * returns an empty object — the migration script adds it, but a fresh
 * deploy that lands first stays safe.
 */

import { sql } from "@/lib/db"
import {
  ALL_FIELDS,
  FIELD_BY_KEY,
  TAXONOMY,
  TIER_WEIGHT,
  IMPORTANCE_MULTIPLIER,
  type FieldDef,
  type FieldTier,
} from "@/lib/portfolio/fund-assessment-taxonomy"
import { applyCanonicalToFund, hydrateFromFund } from "@/lib/portfolio/fund-canonical-sync"

// ── public types ────────────────────────────────────────────────────────

export type AssessmentValues = Record<string, any>

export interface AssessmentCompletion {
  /** Number of fields with a non-empty value, by tier. */
  filled: Record<FieldTier, number>
  /** Total field count by tier. */
  total: Record<FieldTier, number>
  /** Weighted Strength score, 0–1000. */
  strength: number
  /** Per-domain completion %. Keyed by domain.key, 0–1. */
  domainCompletion: Record<string, number>
  /** Per-sub-category completion %. Keyed by `${domain.key}:${sub.key}`, 0–1. */
  subCategoryCompletion: Record<string, number>
}

export interface FundAssessmentResult {
  values: AssessmentValues
  completion: AssessmentCompletion
}

// ── reads ───────────────────────────────────────────────────────────────

/** Module-scoped one-shot probe — funds.assessment column may not exist on
 *  Neon yet. Same pattern as the news_articles.sentiment guard. */
let _assessmentColumnCheck: Promise<boolean> | null = null
export function hasAssessmentColumn(): Promise<boolean> {
  if (_assessmentColumnCheck) return _assessmentColumnCheck
  _assessmentColumnCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name   = 'funds'
           AND column_name  = 'assessment'
         LIMIT 1
      `
      return r.length > 0
    } catch {
      return false
    }
  })()
  return _assessmentColumnCheck
}

export async function getAssessment(fundId: string): Promise<FundAssessmentResult> {
  let values: AssessmentValues = {}
  let fundRow: any = null
  if (await hasAssessmentColumn()) {
    try {
      const rows = await sql`SELECT * FROM funds WHERE id = ${fundId} LIMIT 1`
      fundRow = rows[0] ?? null
      const raw = rows[0]?.assessment
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        values = raw as AssessmentValues
      } else if (typeof raw === "string") {
        try { values = JSON.parse(raw) } catch { values = {} }
      }
    } catch (e) {
      console.error("[fund-assessment getAssessment] read failed", e)
    }
  }
  // Hydrate from canonical funds.* columns so pre-existing fund data
  // (name, target_size, fees, etc.) appears in the assessment editor
  // without re-entry. JSONB takes precedence over column values.
  if (fundRow) values = hydrateFromFund(values, fundRow)
  // Compute derived fields BEFORE counting completion so they contribute.
  values = withDerived(values)
  return {
    values,
    completion: computeCompletion(values),
  }
}

// ── writes ──────────────────────────────────────────────────────────────

export async function patchAssessment(
  fundId: string,
  patch: AssessmentValues,
): Promise<FundAssessmentResult> {
  if (!(await hasAssessmentColumn())) {
    throw new Error(
      "funds.assessment column missing. Run scripts/oneshot/run-funds-assessment-column.mjs first.",
    )
  }
  // Merge: prior values overlaid with patch. Sanitise — drop keys that
  // aren't in the taxonomy, drop computed-field writes (those are derived).
  const before = await getAssessment(fundId)
  const merged: AssessmentValues = { ...before.values }
  for (const [k, v] of Object.entries(patch)) {
    const def = FIELD_BY_KEY[k]
    if (!def) continue                  // unknown key — ignore
    if (def.inputType === "computed") continue  // computed — never persist
    // Empty-string and null both clear the value.
    if (v === "" || v == null) {
      delete merged[k]
    } else {
      merged[k] = v
    }
  }
  // Strip any computed-field keys that may have been written previously.
  for (const f of ALL_FIELDS) {
    if (f.inputType === "computed" && f.key in merged) delete merged[f.key]
  }
  const json = JSON.stringify(merged)
  await sql`
    UPDATE funds
       SET assessment = ${json}::jsonb,
           updated_at = NOW()
     WHERE id = ${fundId}
  `
  // Propagate to canonical funds.* columns. Typing target_fund_size /
  // management_fee / carried_interest / etc. here updates the fund-
  // detail row so capital calls + LP reports + the fund-detail page
  // see the new value immediately.
  await applyCanonicalToFund(fundId, patch).catch((e) =>
    console.error("[patchAssessment canonical sync]", e))
  const withDerivedValues = withDerived(merged)
  return {
    values: withDerivedValues,
    completion: computeCompletion(withDerivedValues),
  }
}

// ── derived (computed) fields ───────────────────────────────────────────

/** Apply every computed-field rule, returning a new object. */
function withDerived(values: AssessmentValues): AssessmentValues {
  const v = { ...values }

  // management_fee_dollars = management_fee% × target_fund_size midpoint
  v.management_fee_dollars = pctOfFundSize(v.management_fee, v.target_fund_size)

  // carry_dollars = carried_interest% × target_fund_size midpoint
  v.carry_dollars = pctOfFundSize(v.carried_interest, v.target_fund_size)

  // gp_commitment_dollars = gp_commitment_pct × target_fund_size midpoint
  v.gp_commitment_dollars = pctOfFundSize(v.gp_commitment_pct, v.target_fund_size)

  // target_gross_moic = (1 + IRR)^hold_period  (when both supplied)
  v.target_gross_moic = computeMoic(v.target_gross_irr, v.target_hold_period)

  // team = synthesised summary line for the UI ("12 ppl · 5 partners · 7yr")
  v.team = computeTeamLine(v)

  // deals = exits + prior funds shorthand
  v.deals = computeDealsLine(v)

  return v
}

function pctOfFundSize(pct: any, fundSize: any): number | null {
  const p = toNum(pct)
  if (p == null) return null
  // target_fund_size is stored as either a single number or {min, max}.
  // Use midpoint when ranged.
  const mid = midpoint(fundSize)
  if (mid == null) return null
  return Math.round((p / 100) * mid)
}

function computeMoic(irr: any, hold: any): number | null {
  const i = toNum(irr)
  const h = toNum(hold)
  if (i == null || h == null || h <= 0) return null
  return Math.round(Math.pow(1 + i / 100, h) * 100) / 100
}

function computeTeamLine(v: AssessmentValues): string | null {
  const size = toNum(v.team_size)
  const seniors = toNum(v.senior_partners_count)
  const years = toNum(v.years_as_team_avg)
  if (size == null && seniors == null && years == null) return null
  const parts: string[] = []
  if (size != null) parts.push(`${size} people`)
  if (seniors != null) parts.push(`${seniors} senior partner${seniors === 1 ? "" : "s"}`)
  if (years != null) parts.push(`${years}yr together`)
  return parts.join(" · ")
}

function computeDealsLine(v: AssessmentValues): string | null {
  const exits = toNum(v.realized_exits_count)
  const funds = toNum(v.prior_fund_count)
  if (exits == null && funds == null) return null
  const parts: string[] = []
  if (funds != null) parts.push(`${funds} prior fund${funds === 1 ? "" : "s"}`)
  if (exits != null) parts.push(`${exits} realised exit${exits === 1 ? "" : "s"}`)
  return parts.join(" · ")
}

// ── completion + scoring ────────────────────────────────────────────────

/** Strength score on 0–1000 scale, weighted by tier × importance. */
export function computeCompletion(values: AssessmentValues): AssessmentCompletion {
  const filled: Record<FieldTier, number> = { critical: 0, supporting: 0, supplemental: 0 }
  const total: Record<FieldTier, number> = { critical: 0, supporting: 0, supplemental: 0 }
  let earned = 0
  let possible = 0

  for (const f of ALL_FIELDS) {
    if (f.inputType === "computed") continue  // computed shouldn't count as a field to fill
    total[f.tier] += 1
    const v = values[f.key]
    const isFilled = isPresent(v)
    if (isFilled) filled[f.tier] += 1
    const weight = TIER_WEIGHT[f.tier] * IMPORTANCE_MULTIPLIER[f.importance]
    possible += weight
    if (isFilled) earned += weight
  }

  const strength = possible > 0 ? Math.round((earned / possible) * 1000) : 0

  // Per-domain + per-sub-category percentages.
  const domainCompletion: Record<string, number> = {}
  const subCategoryCompletion: Record<string, number> = {}
  for (const d of TAXONOMY) {
    let dFilled = 0
    let dTotal = 0
    for (const s of d.subCategories) {
      let sFilled = 0
      let sTotal = 0
      for (const f of s.fields) {
        if (f.inputType === "computed") continue
        sTotal += 1
        if (isPresent(values[f.key])) sFilled += 1
      }
      subCategoryCompletion[`${d.key}:${s.key}`] = sTotal > 0 ? sFilled / sTotal : 0
      dFilled += sFilled
      dTotal += sTotal
    }
    domainCompletion[d.key] = dTotal > 0 ? dFilled / dTotal : 0
  }

  return { filled, total, strength, domainCompletion, subCategoryCompletion }
}

function isPresent(v: any): boolean {
  if (v == null) return false
  if (typeof v === "string") return v.trim().length > 0
  if (typeof v === "number") return Number.isFinite(v)
  if (typeof v === "boolean") return true
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === "object") return Object.keys(v).length > 0
  return Boolean(v)
}

// ── small helpers ───────────────────────────────────────────────────────

function toNum(v: any): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function midpoint(v: any): number | null {
  if (v == null) return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v === "string") {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  if (typeof v === "object") {
    const min = toNum(v.min)
    const max = toNum(v.max)
    if (min != null && max != null) return (min + max) / 2
    if (min != null) return min
    if (max != null) return max
  }
  return null
}
