/**
 * Legal & Compliance — computed-field engine.
 *
 * Derives every `inputType: "computed"` field from its inputs on every
 * read. Computed values are NEVER persisted — they're always materialised
 * fresh so an edit to an input immediately propagates.
 *
 * Eight computed fields in the taxonomy:
 *   - investment_strategy_type            (from sub_asset_class + target_investment_stage)
 *   - lp_split_pct                        (= 100 − carried_interest)
 *   - management_fee_post_investment_period   (mgmt_fee × step-down rule)
 *   - commitment_period_anniversary       (date_of_formation + investment_period yrs)
 *   - commitment_period_extension_anniversary (anniversary + extension_length yrs)
 *   - gp_commitment_dollars               (gp_commitment_pct × target_fund_size)
 *   - final_closing_period_months         (lpa_presentation_date − date_of_formation)
 *
 * Each rule is intentionally simple + auditable. When a fund's terms
 * differ (e.g. tiered carried_interest), the editor's "Edit inputs"
 * affordance opens the underlying input field so the operator can
 * adjust the source rather than the derived value.
 */

import type { LegalFieldValues } from "@/lib/portfolio/legal-fields"

export interface ComputedValue {
  value: any
  /** Whether all inputs were present; false → renders as "—" with a hint. */
  ready: boolean
  /** Per-rule explanation for the "Edit inputs" tooltip. */
  formula: string
  /** Which input field keys this derives from (for the Edit inputs affordance). */
  inputs: string[]
}

/**
 * Compute every derived field and return a fresh values map with them
 * filled in. The original values object is not mutated. Pass the result
 * to the editor so computed cards render correctly without writing to
 * the DB.
 */
export function withComputedFields(values: LegalFieldValues): LegalFieldValues {
  const out = { ...values }
  out.investment_strategy_type = computeInvestmentStrategyType(values).value
  out.lp_split_pct = computeLpSplitPct(values).value
  out.management_fee_post_investment_period = computeMgmtFeePostInvestment(values).value
  out.commitment_period_anniversary = computeCommitmentPeriodAnniversary(values).value
  out.commitment_period_extension_anniversary = computeCommitmentPeriodExtensionAnniversary(values).value
  out.gp_commitment_dollars = computeGpCommitmentDollars(values).value
  out.final_closing_period_months = computeFinalClosingPeriodMonths(values).value
  return out
}

/**
 * Detailed lookup — returns the ComputedValue (value + ready + formula
 * + inputs) for a given computed field key. Used by the UI to render
 * the "Edit inputs" affordance and the rendered formula on hover.
 */
export function describeComputed(key: string, values: LegalFieldValues): ComputedValue | null {
  switch (key) {
    case "investment_strategy_type": return computeInvestmentStrategyType(values)
    case "lp_split_pct": return computeLpSplitPct(values)
    case "management_fee_post_investment_period": return computeMgmtFeePostInvestment(values)
    case "commitment_period_anniversary": return computeCommitmentPeriodAnniversary(values)
    case "commitment_period_extension_anniversary": return computeCommitmentPeriodExtensionAnniversary(values)
    case "gp_commitment_dollars": return computeGpCommitmentDollars(values)
    case "final_closing_period_months": return computeFinalClosingPeriodMonths(values)
    default: return null
  }
}

// ── rules ───────────────────────────────────────────────────────────────

function computeInvestmentStrategyType(v: LegalFieldValues): ComputedValue {
  // Pattern: "<sector> — <stage>" e.g. "Venture Capital — Pre-Seed".
  // When sector is missing we default to "Venture Capital" since this
  // is a VC platform.
  const stage = stringOrNull(v.target_investment_stage)
  const sector = stringOrNull(v.sector_focus) ?? "Venture Capital"
  if (!stage) {
    return {
      value: null, ready: false,
      formula: "{sector_focus} — {target_investment_stage}",
      inputs: ["sector_focus", "target_investment_stage"],
    }
  }
  // Sector_focus can be a comma-separated list; strategy type just picks the first.
  const primarySector = sector.split(",")[0].trim() || "Venture Capital"
  return {
    value: `${primarySector} — ${stage}`,
    ready: true,
    formula: `Primary sector + investment stage`,
    inputs: ["sector_focus", "target_investment_stage"],
  }
}

function computeLpSplitPct(v: LegalFieldValues): ComputedValue {
  // Share of profits to LPs after carry split (standard waterfall).
  const carry = numberOrNull(v.carried_interest)
  if (carry == null) {
    return { value: null, ready: false, formula: "100 − carried_interest", inputs: ["carried_interest"] }
  }
  return {
    value: round2(100 - carry),
    ready: true,
    formula: "100% − Carried Interest",
    inputs: ["carried_interest"],
  }
}

function computeMgmtFeePostInvestment(v: LegalFieldValues): ComputedValue {
  // Default rule: management fee steps down by 25% post-investment period.
  // E.g. 2.0% during the IP → 1.5% afterwards. The operator can override
  // by setting the underlying inputs.
  const fee = numberOrNull(v.management_fee)
  if (fee == null) {
    return {
      value: null, ready: false,
      formula: "Management Fee × 0.75 (standard 25% step-down)",
      inputs: ["management_fee"],
    }
  }
  return {
    value: round2(fee * 0.75),
    ready: true,
    formula: "Management Fee × 0.75 (standard 25% step-down post-IP)",
    inputs: ["management_fee", "investment_period"],
  }
}

function computeCommitmentPeriodAnniversary(v: LegalFieldValues): ComputedValue {
  const dof = parseDate(v.date_of_formation)
  const ip = numberOrNull(v.investment_period)
  if (!dof || ip == null) {
    return {
      value: null, ready: false,
      formula: "Date of Formation + Investment Period (years)",
      inputs: ["date_of_formation", "investment_period"],
    }
  }
  const d = addYears(dof, ip)
  return {
    value: formatLegalDate(d),
    ready: true,
    formula: `Date of Formation + ${ip} years`,
    inputs: ["date_of_formation", "investment_period"],
  }
}

function computeCommitmentPeriodExtensionAnniversary(v: LegalFieldValues): ComputedValue {
  const dof = parseDate(v.date_of_formation)
  const ip = numberOrNull(v.investment_period)
  const ext = numberOrNull(v.extension_length)
  if (!dof || ip == null) {
    return {
      value: null, ready: false,
      formula: "Anniversary + Extension Length (years)",
      inputs: ["date_of_formation", "investment_period", "extension_length"],
    }
  }
  const total = ip + (ext ?? 1)  // default 1-year extension when unset
  const d = addYears(dof, total)
  return {
    value: formatLegalDate(d),
    ready: true,
    formula: ext != null
      ? `Date of Formation + ${ip} + ${ext} years`
      : `Date of Formation + ${ip} + 1 year (default extension)`,
    inputs: ["date_of_formation", "investment_period", "extension_length"],
  }
}

function computeGpCommitmentDollars(v: LegalFieldValues): ComputedValue {
  const pct = numberOrNull(v.gp_commitment_pct)
  const size = numberOrNull(v.target_fund_size)
  if (pct == null || size == null) {
    return {
      value: null, ready: false,
      formula: "GP Commitment % × Target Fund Size",
      inputs: ["gp_commitment_pct", "target_fund_size"],
    }
  }
  return {
    value: Math.round((pct / 100) * size),
    ready: true,
    formula: `${pct}% × ${formatCurrency(size)}`,
    inputs: ["gp_commitment_pct", "target_fund_size"],
  }
}

function computeFinalClosingPeriodMonths(v: LegalFieldValues): ComputedValue {
  // The fund-launch reference treats Final Closing Date as the date when
  // the A&R LPA is presented (lpa_presentation_date in our taxonomy).
  const dof = parseDate(v.date_of_formation)
  const close = parseDate(v.lpa_presentation_date)
  if (!dof || !close) {
    return {
      value: null, ready: false,
      formula: "LPA Presentation Date − Date of Formation (months)",
      inputs: ["date_of_formation", "lpa_presentation_date"],
    }
  }
  const months = monthsBetween(dof, close)
  return {
    value: months,
    ready: true,
    formula: `${formatLegalDate(close)} − ${formatLegalDate(dof)}`,
    inputs: ["date_of_formation", "lpa_presentation_date"],
  }
}

// ── helpers ─────────────────────────────────────────────────────────────

function numberOrNull(v: any): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function stringOrNull(v: any): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length > 0 ? t : null
}

function parseDate(v: any): Date | null {
  if (!v) return null
  if (v instanceof Date) return v
  const d = new Date(String(v))
  return Number.isNaN(d.getTime()) ? null : d
}

function addYears(d: Date, years: number): Date {
  const out = new Date(d.getTime())
  out.setFullYear(out.getFullYear() + Math.round(years))
  return out
}

function monthsBetween(a: Date, b: Date): number {
  const years = b.getFullYear() - a.getFullYear()
  const months = b.getMonth() - a.getMonth()
  const days = b.getDate() - a.getDate()
  let total = years * 12 + months
  if (days < 0) total -= 1
  return Math.max(0, total)
}

function formatLegalDate(d: Date): string {
  // ISO YYYY-MM-DD — render layer formats however needed (legal docs
  // prefer "Month DD, YYYY" but we store ISO so the format is stable).
  return d.toISOString().slice(0, 10)
}

function formatCurrency(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n}`
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
