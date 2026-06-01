/**
 * QSBS — Section 1202 eligibility calculator (Anker original).
 *
 * Implements the four headline tests every founder/early employee should
 * check before assuming the up-to-$10M / 10× exit gain is tax-free:
 *
 *   1. C-corp issuer at original issuance
 *   2. ≥ 5-year holding period
 *   3. Aggregate gross assets ≤ $50M at + immediately after issuance
 *   4. Active-business requirement (80%+ of assets used in qualified trade)
 *
 * Plus the per-issuer cap (greater of $10M or 10× basis) and a quick
 * estimate of after-tax proceeds.
 *
 * NOT TAX ADVICE — this is a planning aid; consult a tax advisor.
 */

import { buildWorkbook, fmtUsd, type SheetSpec } from "./xlsx-export"

export interface QsbsInputs {
  isCCorp: boolean
  acquiredAt: string // ISO date
  exitAt: string // ISO date
  grossAssetsAtIssuance: number // USD
  inActiveBusiness: boolean
  excludedTrade: boolean // health, law, finance, hotels, etc.
  costBasis: number
  saleProceeds: number
  /** Marginal LTCG rate (federal + state combined). Default 23.8% (20 LTCG + 3.8 NIIT). */
  taxRateLtcg?: number
  /** Years acquired before 2010 (50%) or 2010-2010 (75%) get smaller exclusions. */
  acquisitionEra?: "post_sept_2010" | "feb_to_sept_2010" | "pre_2010"
}

export interface QsbsResult {
  // Test outcomes
  passes: {
    cCorp: boolean
    holding: boolean
    grossAssets: boolean
    activeBusiness: boolean
    eligibleTrade: boolean
  }
  yearsHeld: number
  // Cap & exclusion
  exclusionPct: number // 0.5 / 0.75 / 1.0
  perIssuerCap: number // greater of $10M or 10× basis
  capacityRemaining: number // USD of gain that can be excluded
  gainTotal: number
  excludedGain: number
  taxableGain: number
  estimatedFedTax: number
  estimatedSavings: number // tax saved vs. no QSBS
  qualifies: boolean
  notes: string[]
}

const FIVE_YEAR_HOLDING_DAYS = 5 * 365
const TEN_M = 10_000_000
const FIFTY_M = 50_000_000

export function compute(inp: QsbsInputs): QsbsResult {
  const acq = new Date(inp.acquiredAt)
  const exit = new Date(inp.exitAt)
  const days = Math.max(0, (exit.getTime() - acq.getTime()) / (1000 * 60 * 60 * 24))
  const yearsHeld = days / 365

  const passes = {
    cCorp: inp.isCCorp,
    holding: days >= FIVE_YEAR_HOLDING_DAYS,
    grossAssets: inp.grossAssetsAtIssuance <= FIFTY_M,
    activeBusiness: inp.inActiveBusiness,
    eligibleTrade: !inp.excludedTrade,
  }
  const qualifies = Object.values(passes).every(Boolean)

  // Exclusion percent based on issuance era
  let exclusionPct: number
  if (inp.acquisitionEra === "pre_2010") exclusionPct = 0.5
  else if (inp.acquisitionEra === "feb_to_sept_2010") exclusionPct = 0.75
  else exclusionPct = 1.0

  const perIssuerCap = Math.max(TEN_M, 10 * inp.costBasis)
  const gainTotal = Math.max(0, inp.saleProceeds - inp.costBasis)
  const eligibleGain = qualifies ? Math.min(gainTotal, perIssuerCap) : 0
  const excludedGain = eligibleGain * exclusionPct
  const taxableGain = gainTotal - excludedGain
  const taxRate = inp.taxRateLtcg ?? 0.238
  const estimatedFedTax = taxableGain * taxRate
  const wouldBeTaxNoQsbs = gainTotal * taxRate
  const estimatedSavings = wouldBeTaxNoQsbs - estimatedFedTax
  const capacityRemaining = Math.max(0, perIssuerCap - gainTotal)

  const notes: string[] = []
  if (!passes.cCorp) notes.push("Issuer must have been a C-corporation at original issuance. LLCs that converted later may still qualify post-conversion if all other tests are met.")
  if (!passes.holding) {
    const remaining = (FIVE_YEAR_HOLDING_DAYS - days) / 365
    notes.push(`Holding period below 5 years. Need to wait ~${remaining.toFixed(1)} more years.`)
  }
  if (!passes.grossAssets) notes.push(`Gross assets at issuance exceeded $50M. Strict measurement test — confirm with tax counsel.`)
  if (!passes.activeBusiness) notes.push("Active-business test fails: 80%+ of assets must be used in a qualified trade or business.")
  if (!passes.eligibleTrade) notes.push("Excluded trade (health, law, banking, hotels, farming, mining, accounting, performing arts, consulting). QSBS unavailable.")
  if (qualifies && exclusionPct < 1) notes.push(`Stock issued in a partial-exclusion era (${(exclusionPct * 100).toFixed(0)}% exclusion).`)
  if (qualifies) notes.push(`Per-issuer cap = greater of $10M or 10× basis (${fmtUsd(perIssuerCap)}). Spousal stacking + non-grantor trusts can multiply this cap.`)

  return {
    passes,
    yearsHeld,
    exclusionPct,
    perIssuerCap,
    capacityRemaining,
    gainTotal,
    excludedGain,
    taxableGain,
    estimatedFedTax,
    estimatedSavings,
    qualifies,
    notes,
  }
}

export function buildExportWorkbook(inp: QsbsInputs) {
  const r = compute(inp)

  const inputsSheet: SheetSpec = {
    name: "Inputs",
    title: "QSBS Eligibility — Inputs",
    subtitle: `Built natively in Anker · ${new Date().toISOString().slice(0, 10)} · NOT TAX ADVICE`,
    headers: ["Field", "Value"],
    rows: [
      ["Issuer is a C-corp", inp.isCCorp ? "yes" : "no"],
      ["Stock acquired on", inp.acquiredAt],
      ["Sold / sale date", inp.exitAt],
      ["Years held", r.yearsHeld.toFixed(2)],
      ["Aggregate gross assets at issuance", fmtUsd(inp.grossAssetsAtIssuance)],
      ["Active-business test (80%+ in qualified trade)", inp.inActiveBusiness ? "yes" : "no"],
      ["Excluded trade (health/law/etc.)", inp.excludedTrade ? "yes" : "no"],
      ["Cost basis", fmtUsd(inp.costBasis)],
      ["Sale proceeds", fmtUsd(inp.saleProceeds)],
      ["Total gain", fmtUsd(r.gainTotal)],
      ["Acquisition era", inp.acquisitionEra ?? "post_sept_2010"],
      ["Marginal LTCG rate (fed + state)", `${((inp.taxRateLtcg ?? 0.238) * 100).toFixed(1)}%`],
    ],
    colWidths: [44, 22],
  }

  const testsSheet: SheetSpec = {
    name: "Tests",
    title: "Section 1202 — eligibility tests",
    headers: ["Test", "Pass?", "Detail"],
    rows: [
      ["1. C-corp at original issuance", r.passes.cCorp ? "✓" : "✗", "Required."],
      ["2. ≥ 5-year holding period", r.passes.holding ? "✓" : "✗", `${r.yearsHeld.toFixed(2)} years held.`],
      ["3. Gross assets ≤ $50M at issuance", r.passes.grossAssets ? "✓" : "✗", fmtUsd(inp.grossAssetsAtIssuance)],
      ["4. Active-business test (80% rule)", r.passes.activeBusiness ? "✓" : "✗", "Operating co., not a holding co."],
      ["5. Not in an excluded trade", r.passes.eligibleTrade ? "✓" : "✗", "Health, law, finance, hotels are excluded."],
      ["OVERALL", r.qualifies ? "✓ qualifies" : "✗ does not qualify", ""],
    ],
    colWidths: [40, 14, 60],
  }

  const resultsSheet: SheetSpec = {
    name: "Results",
    title: "QSBS — exclusion & tax outcome",
    headers: ["Metric", "Value"],
    rows: [
      ["Exclusion percentage (era-dependent)", `${(r.exclusionPct * 100).toFixed(0)}%`],
      ["Per-issuer cap (max(\\$10M, 10× basis))", fmtUsd(r.perIssuerCap)],
      ["Total gain", fmtUsd(r.gainTotal)],
      ["Excluded gain", fmtUsd(r.excludedGain)],
      ["Taxable gain after exclusion", fmtUsd(r.taxableGain)],
      ["Estimated federal LTCG tax", fmtUsd(r.estimatedFedTax)],
      ["Estimated tax savings vs. no QSBS", fmtUsd(r.estimatedSavings)],
      ["Cap capacity remaining for future sales", fmtUsd(r.capacityRemaining)],
    ],
    colWidths: [42, 22],
  }

  const notesSheet: SheetSpec = {
    name: "Notes",
    title: "Notes",
    headers: ["#", "Note"],
    rows: r.notes.length ? r.notes.map((n, i) => [i + 1, n]) : [["—", "No flags."]],
    colWidths: [4, 100],
  }

  return buildWorkbook([inputsSheet, testsSheet, resultsSheet, notesSheet])
}
