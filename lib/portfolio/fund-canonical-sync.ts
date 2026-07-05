/**
 * Bidirectional sync between assessment/legal field JSONB ↔ canonical
 * funds columns.
 *
 * Why: a fund manager who types "SVS Fund II" into the Fund Name slot
 * in the legal editor expects that to update the fund's `funds.name`
 * column too — so it's reflected on the fund-detail page, in capital
 * calls, in LP reports, everywhere. Same goes for fee/carry/term, etc.
 * Without this glue, the same data lives in three places (funds row +
 * assessment JSONB + legal JSONB) and drifts immediately.
 *
 * Direction:
 *   - On WRITE (patchAssessment / patchLegalFields) → also UPDATE
 *     funds.<column> if the key has a canonical mapping. This is
 *     applyCanonicalToFund().
 *   - On READ (getAssessment / getLegalFields) → seed any unset JSONB
 *     keys FROM the funds row so a pre-existing fund's data shows up
 *     in the editor without re-entry. This is hydrateFromFund().
 *
 * One mapping table, used by both surfaces. The legal taxonomy uses
 * different keys than assessment (e.g. `fund_name` vs `name`), and
 * some columns are stored differently (carry_pct is a fraction in
 * funds, a whole percent in the editor), so each entry includes
 * to/from coercions.
 */

import { sql } from "@/lib/db"

export interface CanonicalSpec<TFundColumn extends string = string> {
  /** Column on the funds table. */
  fundColumn: TFundColumn
  /** Field keys (across BOTH assessment and legal taxonomies) that map here. */
  fieldKeys: string[]
  /** JSONB value → fund-column value (e.g. percent / 100 → fraction). */
  toFundValue?: (v: any) => any
  /** Fund-column value → JSONB value (inverse of toFundValue). */
  toFieldValue?: (v: any) => any
}

// ── canonical column registry ───────────────────────────────────────────

const PCT_TO_FRACTION = (v: any): number | null => {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return null
  // Editor stores percent in whole units (2 = 2%); funds column stores
  // fraction (0.02). Guard against double-conversion if value is already
  // a fraction (≤ 1) — but in practice all 90+ taxonomy fields use the
  // whole-percent convention so we just divide.
  return n > 1 ? n / 100 : n
}
const FRACTION_TO_PCT = (v: any): number | null => {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return null
  return n * 100
}

export const CANONICAL_SPECS: CanonicalSpec[] = [
  {
    fundColumn: "name",
    // Both assessment + legal use "fund_name" in their taxonomies; also
    // accept "name" for fund-detail-style imports.
    fieldKeys: ["fund_name", "name"],
  },
  {
    fundColumn: "vintage_year",
    fieldKeys: ["vintage_year", "vintage"],
    toFundValue: (v) => v ? Number(v) : null,
  },
  {
    fundColumn: "target_size",
    fieldKeys: ["target_fund_size", "target_size"],
    toFundValue: (v) => v ? Number(v) : null,
  },
  {
    fundColumn: "currency",
    fieldKeys: ["currency", "fund_currency"],
    toFundValue: (v) => v ? String(v).toUpperCase().slice(0, 4) : null,
  },
  {
    fundColumn: "management_fee_pct",
    fieldKeys: ["management_fee", "management_fee_pct"],
    toFundValue: PCT_TO_FRACTION,
    toFieldValue: FRACTION_TO_PCT,
  },
  {
    fundColumn: "carry_pct",
    fieldKeys: ["carried_interest", "carry_pct"],
    toFundValue: PCT_TO_FRACTION,
    toFieldValue: FRACTION_TO_PCT,
  },
  {
    fundColumn: "term_years",
    fieldKeys: ["fund_term", "term_years"],
    toFundValue: (v) => v ? Number(v) : null,
  },
  {
    fundColumn: "investment_period_years",
    fieldKeys: ["investment_period", "investment_period_years"],
    toFundValue: (v) => v ? Number(v) : null,
  },
  {
    fundColumn: "manager_org",
    fieldKeys: ["fm_legal_name", "manager_org"],
  },
  {
    fundColumn: "description",
    // Pull from the AI-generated thesis when nothing else is set.
    fieldKeys: ["thesis_statement", "description"],
  },
]

// ── derived indexes ────────────────────────────────────────────────────-

const SPEC_BY_FIELD: Record<string, CanonicalSpec> = (() => {
  const out: Record<string, CanonicalSpec> = {}
  for (const s of CANONICAL_SPECS) {
    for (const k of s.fieldKeys) out[k] = s
  }
  return out
})()

const SPEC_BY_FUND_COLUMN: Record<string, CanonicalSpec> = Object.fromEntries(
  CANONICAL_SPECS.map((s) => [s.fundColumn, s]),
)

// ── public API ─────────────────────────────────────────────────────────-

/**
 * Apply a JSONB-patch to the matching funds.* columns. Called from
 * patchAssessment + patchLegalFields after they merge the patch in.
 * Coercion uses the spec's toFundValue (defaulting to identity).
 *
 * Multiple field keys may map to the same column — last write wins, in
 * the order keys appear in the patch object.
 */
export async function applyCanonicalToFund(
  fundId: string,
  jsonbPatch: Record<string, any>,
): Promise<{ columnsUpdated: string[] }> {
  const updates: Record<string, any> = {}
  for (const [key, value] of Object.entries(jsonbPatch)) {
    const spec = SPEC_BY_FIELD[key]
    if (!spec) continue
    if (value == null || value === "") continue
    const coerced = spec.toFundValue ? spec.toFundValue(value) : value
    if (coerced == null) continue
    updates[spec.fundColumn] = coerced
  }
  const cols = Object.keys(updates)
  if (cols.length === 0) return { columnsUpdated: [] }

  // Whitelist of column names → no SQL injection surface from the keys.
  const whitelist = new Set(Object.keys(SPEC_BY_FUND_COLUMN))
  const safeCols = cols.filter((c) => whitelist.has(c))
  if (safeCols.length === 0) return { columnsUpdated: [] }

  // Build the SET clause as separate tagged-template UPDATEs. Neon's
  // serverless driver doesn't support dynamic identifier interpolation
  // inside a single tagged template, so we issue one UPDATE per column
  // — there's at most ~10 columns mapped, all in a single request from
  // the editor, so the extra round-trips are cheap.
  for (const col of safeCols) {
    const v = updates[col]
    switch (col) {
      case "name":
        await sql`UPDATE funds SET name = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      case "description":
        await sql`UPDATE funds SET description = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      case "vintage_year":
        await sql`UPDATE funds SET vintage_year = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      case "target_size":
        await sql`UPDATE funds SET target_size = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      case "currency":
        await sql`UPDATE funds SET currency = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      case "management_fee_pct":
        await sql`UPDATE funds SET management_fee_pct = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      case "carry_pct":
        await sql`UPDATE funds SET carry_pct = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      case "term_years":
        await sql`UPDATE funds SET term_years = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      case "investment_period_years":
        await sql`UPDATE funds SET investment_period_years = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      case "manager_org":
        await sql`UPDATE funds SET manager_org = ${v}, updated_at = NOW() WHERE id = ${fundId}::uuid`; break
      default:
        console.warn(`[fund-canonical-sync] unhandled column ${col}`)
    }
  }
  console.log(`[fund-canonical-sync] fund=${fundId} updated columns: ${safeCols.join(", ")}`)
  return { columnsUpdated: safeCols }
}

/**
 * Seed any unset JSONB keys from the fund's canonical columns. Called
 * at the top of getAssessment + getLegalFields so an existing fund's
 * data shows up in the editor without re-entry.
 *
 * Returns a NEW values map — never mutates input. JSONB takes
 * precedence: we only fill keys that are missing or empty.
 */
export function hydrateFromFund<V extends Record<string, any>>(
  values: V,
  fundRow: { [k: string]: any },
): V {
  const out = { ...values } as Record<string, any>
  for (const spec of CANONICAL_SPECS) {
    const fromFund = fundRow[spec.fundColumn]
    if (fromFund == null || fromFund === "") continue
    const fieldValue = spec.toFieldValue ? spec.toFieldValue(fromFund) : fromFund
    if (fieldValue == null || fieldValue === "") continue
    for (const key of spec.fieldKeys) {
      const existing = out[key]
      const isEmpty = existing == null || existing === "" || (Array.isArray(existing) && existing.length === 0)
      if (isEmpty) out[key] = fieldValue
    }
  }
  return out as V
}
