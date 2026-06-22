/**
 * Fund assessment history — snapshots + deltas + recommendations.
 *
 * Phase 2 layer on top of lib/portfolio/fund-assessment.ts. Adds:
 *
 *   - snapshotIfChanged(): writes a history row when the score has moved
 *     beyond a small threshold OR when the previous snapshot is older than
 *     the debounce window. Keeps the table small without losing meaningful
 *     transitions.
 *
 *   - getLatestSnapshot(fundId): returns the most recent history row.
 *
 *   - listSnapshots(fundId, limit): returns up to N most-recent snapshots.
 *
 *   - computeDelta(current, prior): scoring deltas (strength + per-domain),
 *     plus a human-readable "since X" label.
 *
 *   - recommendNextFields(values): ranks unfilled fields by the score gain
 *     they'd contribute. Used by the Recommendations panel.
 *
 * The table is created by scripts/oneshot/run-fund-assessment-history-table.mjs.
 * Schema-drift guard so a deploy before the migration runs doesn't crash.
 */

import { sql } from "@/lib/db"
import {
  ALL_FIELDS,
  TAXONOMY,
  TIER_WEIGHT,
  IMPORTANCE_MULTIPLIER,
  FIELD_BY_KEY,
  SUBCATEGORY_BY_FIELD_KEY,
  type FieldDef,
  type FieldTier,
} from "@/lib/portfolio/fund-assessment-taxonomy"
import type {
  AssessmentValues,
  AssessmentCompletion,
} from "@/lib/portfolio/fund-assessment"

// ── types ───────────────────────────────────────────────────────────────

export interface AssessmentSnapshot {
  id: string
  fund_id: string
  strength: number
  domain_scores: Record<string, number>
  subcat_scores: Record<string, number>
  filled_critical: number
  filled_supporting: number
  filled_supplemental: number
  total_critical: number
  total_supporting: number
  total_supplemental: number
  captured_by: string | null
  captured_at: string
}

export interface AssessmentDelta {
  /** Strength change since the prior snapshot (positive = improvement). */
  strength: number
  /** Per-domain delta in completion-fraction (e.g. 0.05 = +5%). */
  domain: Record<string, number>
  /** ISO timestamp the prior snapshot was captured. */
  priorCapturedAt: string | null
  /** Human-readable relative-time label, e.g. "2 days ago". */
  priorLabel: string | null
}

export interface RecommendedField {
  fieldKey: string
  fieldLabel: string
  domainKey: string
  domainLabel: string
  subKey: string
  subLabel: string
  tier: FieldTier
  /** Approximate points the Strength score would gain if this field were
   *  filled in (assumes other fields stay constant). */
  estimatedPointsGain: number
}

// ── snapshots: schema-drift guard ───────────────────────────────────────

let _historyTableCheck: Promise<boolean> | null = null
function hasHistoryTable(): Promise<boolean> {
  if (_historyTableCheck) return _historyTableCheck
  _historyTableCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public'
           AND table_name   = 'fund_assessment_history'
         LIMIT 1
      `
      return r.length > 0
    } catch {
      return false
    }
  })()
  return _historyTableCheck
}

// ── snapshots: read ─────────────────────────────────────────────────────

export async function getLatestSnapshot(fundId: string): Promise<AssessmentSnapshot | null> {
  if (!(await hasHistoryTable())) return null
  try {
    const rows = await sql`
      SELECT * FROM fund_assessment_history
       WHERE fund_id = ${fundId}::uuid
       ORDER BY captured_at DESC
       LIMIT 1
    `
    return rows[0] ? normalizeSnapshot(rows[0]) : null
  } catch (e) {
    console.error("[fund-assessment-history getLatestSnapshot]", e)
    return null
  }
}

export async function listSnapshots(fundId: string, limit = 20): Promise<AssessmentSnapshot[]> {
  if (!(await hasHistoryTable())) return []
  try {
    const rows = await sql`
      SELECT * FROM fund_assessment_history
       WHERE fund_id = ${fundId}::uuid
       ORDER BY captured_at DESC
       LIMIT ${Math.max(1, Math.min(200, limit))}
    `
    return rows.map(normalizeSnapshot)
  } catch (e) {
    console.error("[fund-assessment-history listSnapshots]", e)
    return []
  }
}

// ── snapshots: write ────────────────────────────────────────────────────

const DEBOUNCE_MS = 15 * 60 * 1000   // 15 minutes
const SCORE_DELTA_THRESHOLD = 5      // points

/**
 * Insert a snapshot row if either:
 *   1. The most recent snapshot is older than DEBOUNCE_MS, OR
 *   2. The strength score has moved by ≥ SCORE_DELTA_THRESHOLD points
 *      since the most recent snapshot, OR
 *   3. There is no prior snapshot at all.
 *
 * Returns the snapshot that was written, or null if nothing was inserted
 * (because the rate-limit didn't fire).
 */
export async function snapshotIfChanged(
  fundId: string,
  completion: AssessmentCompletion,
  capturedBy: string | null,
): Promise<AssessmentSnapshot | null> {
  if (!(await hasHistoryTable())) return null

  const prior = await getLatestSnapshot(fundId)
  if (prior) {
    const ageMs = Date.now() - new Date(prior.captured_at).getTime()
    const scoreDelta = Math.abs(completion.strength - prior.strength)
    if (ageMs < DEBOUNCE_MS && scoreDelta < SCORE_DELTA_THRESHOLD) {
      return null
    }
  }

  try {
    const rows = await sql`
      INSERT INTO fund_assessment_history (
        fund_id, strength, domain_scores, subcat_scores,
        filled_critical, filled_supporting, filled_supplemental,
        total_critical, total_supporting, total_supplemental,
        captured_by, captured_at
      ) VALUES (
        ${fundId}::uuid,
        ${completion.strength},
        ${JSON.stringify(completion.domainCompletion)}::jsonb,
        ${JSON.stringify(completion.subCategoryCompletion)}::jsonb,
        ${completion.filled.critical},
        ${completion.filled.supporting},
        ${completion.filled.supplemental},
        ${completion.total.critical},
        ${completion.total.supporting},
        ${completion.total.supplemental},
        ${capturedBy},
        NOW()
      )
      RETURNING *
    `
    return rows[0] ? normalizeSnapshot(rows[0]) : null
  } catch (e) {
    console.error("[fund-assessment-history snapshotIfChanged] insert failed", e)
    return null
  }
}

// ── deltas ──────────────────────────────────────────────────────────────

/**
 * Compute the score / per-domain delta between the current state and a
 * prior snapshot. Returns zero-deltas when there's no prior snapshot.
 */
export function computeDelta(
  current: AssessmentCompletion,
  prior: AssessmentSnapshot | null,
): AssessmentDelta {
  if (!prior) {
    return {
      strength: 0,
      domain: {},
      priorCapturedAt: null,
      priorLabel: null,
    }
  }
  const domain: Record<string, number> = {}
  for (const d of TAXONOMY) {
    const cur = current.domainCompletion[d.key] ?? 0
    const old = prior.domain_scores[d.key] ?? 0
    const diff = cur - old
    // Only surface domains where something actually changed (> 0.5%).
    if (Math.abs(diff) > 0.005) domain[d.key] = diff
  }
  return {
    strength: current.strength - prior.strength,
    domain,
    priorCapturedAt: prior.captured_at,
    priorLabel: relativeLabel(prior.captured_at),
  }
}

// ── recommendations ─────────────────────────────────────────────────────

/**
 * Rank unfilled fields by the score gain they'd contribute. Computed-fields
 * are skipped (they're derived, not editable). Generated-fields are
 * INCLUDED because filling them via AI is still a meaningful gain.
 *
 * Score-gain math mirrors lib/portfolio/fund-assessment.ts computeCompletion:
 * each filled field contributes (TIER_WEIGHT × IMPORTANCE_MULTIPLIER) to
 * the earned weight pool. The 0-1000 score is earned/possible × 1000, so
 * a single field's contribution to the score is (weight / possible) × 1000.
 *
 * Returns up to `limit` recommendations sorted by potential gain.
 */
export function recommendNextFields(
  values: AssessmentValues,
  limit = 5,
): RecommendedField[] {
  // First pass: total possible-weight pool (identical to computeCompletion).
  let totalPossible = 0
  for (const f of ALL_FIELDS) {
    if (f.inputType === "computed") continue
    totalPossible += TIER_WEIGHT[f.tier] * IMPORTANCE_MULTIPLIER[f.importance]
  }
  if (totalPossible <= 0) return []

  const out: RecommendedField[] = []
  for (const f of ALL_FIELDS) {
    if (f.inputType === "computed") continue
    if (isPresent(values[f.key])) continue
    const weight = TIER_WEIGHT[f.tier] * IMPORTANCE_MULTIPLIER[f.importance]
    const gain = Math.round((weight / totalPossible) * 1000 * 10) / 10  // 1 d.p.
    const loc = SUBCATEGORY_BY_FIELD_KEY[f.key]
    out.push({
      fieldKey: f.key,
      fieldLabel: f.label,
      domainKey: loc.domain.key,
      domainLabel: loc.domain.label,
      subKey: loc.sub.key,
      subLabel: loc.sub.label,
      tier: f.tier,
      estimatedPointsGain: gain,
    })
  }
  out.sort((a, b) => b.estimatedPointsGain - a.estimatedPointsGain)
  return out.slice(0, Math.max(1, Math.min(50, limit)))
}

// ── helpers ─────────────────────────────────────────────────────────────

function normalizeSnapshot(r: any): AssessmentSnapshot {
  return {
    id: r.id,
    fund_id: r.fund_id,
    strength: Number(r.strength ?? 0),
    domain_scores: parseJsonObj(r.domain_scores),
    subcat_scores: parseJsonObj(r.subcat_scores),
    filled_critical: Number(r.filled_critical ?? 0),
    filled_supporting: Number(r.filled_supporting ?? 0),
    filled_supplemental: Number(r.filled_supplemental ?? 0),
    total_critical: Number(r.total_critical ?? 0),
    total_supporting: Number(r.total_supporting ?? 0),
    total_supplemental: Number(r.total_supplemental ?? 0),
    captured_by: r.captured_by ?? null,
    captured_at: r.captured_at instanceof Date ? r.captured_at.toISOString() : String(r.captured_at),
  }
}

function parseJsonObj(v: any): Record<string, number> {
  if (!v) return {}
  if (typeof v === "object" && !Array.isArray(v)) return v as Record<string, number>
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v)
      return p && typeof p === "object" && !Array.isArray(p) ? p : {}
    } catch { return {} }
  }
  return {}
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

function relativeLabel(iso: string): string {
  const t = new Date(iso).getTime()
  const now = Date.now()
  const sec = Math.max(0, Math.floor((now - t) / 1000))
  if (sec < 60) return "just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`
  const mo = Math.floor(day / 30)
  if (mo < 12) return `${mo} mo ago`
  const yr = Math.floor(day / 365)
  return `${yr} yr${yr === 1 ? "" : "s"} ago`
}
