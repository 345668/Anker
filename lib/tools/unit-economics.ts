/**
 * Unit-economics calculator (Anker original).
 *
 * Pure functions — UI and xlsx export both consume the same `compute()`.
 */

import { buildWorkbook, type SheetSpec, fmtPct, fmtUsd } from "./xlsx-export"

export interface UnitEconomicsInputs {
  arpaMonthly: number // average revenue per account (monthly)
  grossMargin: number // 0..1
  monthlyChurn: number // 0..1, churn for the cohort
  cac: number // cost to acquire one customer
  // Optional: variable expansion
  expansionRate?: number // monthly net expansion rate (negative churn)
}

export interface UnitEconomicsResult {
  monthlyContribution: number
  arpaAnnual: number
  effectiveChurn: number // churn - expansion (floored at 0)
  customerLifetimeMonths: number
  ltv: number
  ltvCacRatio: number
  paybackMonths: number
  burnPerCustomer: number // CAC minus first-month contribution
  health: "great" | "good" | "marginal" | "bad"
  notes: string[]
}

export function compute(inp: UnitEconomicsInputs): UnitEconomicsResult {
  const monthlyContribution = inp.arpaMonthly * inp.grossMargin
  const arpaAnnual = inp.arpaMonthly * 12
  const effectiveChurn = Math.max(0.0001, (inp.monthlyChurn ?? 0) - (inp.expansionRate ?? 0))
  const customerLifetimeMonths = 1 / effectiveChurn
  const ltv = monthlyContribution * customerLifetimeMonths
  const ltvCacRatio = inp.cac > 0 ? ltv / inp.cac : 0
  const paybackMonths = monthlyContribution > 0 ? inp.cac / monthlyContribution : Infinity
  const burnPerCustomer = inp.cac - monthlyContribution

  let health: UnitEconomicsResult["health"]
  if (ltvCacRatio >= 3 && paybackMonths <= 12) health = "great"
  else if (ltvCacRatio >= 3) health = "good"
  else if (ltvCacRatio >= 1) health = "marginal"
  else health = "bad"

  const notes: string[] = []
  if (ltvCacRatio < 3) notes.push("LTV:CAC < 3 is below the rule-of-thumb threshold for venture-scale unit economics.")
  if (paybackMonths > 18) notes.push("Payback >18 months puts pressure on cash; consider lowering CAC or raising ARPA.")
  if (inp.grossMargin < 0.6) notes.push("Sub-60% gross margin caps how much you can spend to acquire customers.")
  if ((inp.expansionRate ?? 0) > inp.monthlyChurn) notes.push("Net negative churn — expansion exceeds losses; LTV is effectively unbounded over time.")

  return {
    monthlyContribution,
    arpaAnnual,
    effectiveChurn,
    customerLifetimeMonths,
    ltv,
    ltvCacRatio,
    paybackMonths,
    burnPerCustomer,
    health,
    notes,
  }
}

// ─── Sensitivity table: LTV:CAC at various churn × CAC combos ──────────────
export function sensitivityGrid(base: UnitEconomicsInputs) {
  const churns = [0.005, 0.01, 0.02, 0.03, 0.05, 0.08, 0.12]
  const cacs = [100, 250, 500, 1000, 2500, 5000]
  const headers = ["Monthly churn ↓ / CAC →", ...cacs.map((c) => fmtUsd(c))]
  const rows = churns.map((ch) => {
    const row: any[] = [`${(ch * 100).toFixed(1)}%`]
    for (const cac of cacs) {
      const r = compute({ ...base, monthlyChurn: ch, cac })
      row.push(r.ltvCacRatio.toFixed(2) + "×")
    }
    return row
  })
  return { headers, rows }
}

// ─── XLSX export ───────────────────────────────────────────────────────────
export function buildExportWorkbook(inp: UnitEconomicsInputs) {
  const r = compute(inp)
  const sens = sensitivityGrid(inp)

  const inputsSheet: SheetSpec = {
    name: "Inputs",
    title: "Unit Economics — Inputs",
    subtitle: `Built natively in Anker · ${new Date().toISOString().slice(0, 10)}`,
    headers: ["Field", "Value"],
    rows: [
      ["ARPA — monthly", fmtUsd(inp.arpaMonthly)],
      ["ARPA — annual", fmtUsd(r.arpaAnnual)],
      ["Gross margin", fmtPct(inp.grossMargin)],
      ["Monthly churn", fmtPct(inp.monthlyChurn)],
      ["Monthly expansion rate", fmtPct(inp.expansionRate ?? 0)],
      ["Effective churn (churn − expansion)", fmtPct(r.effectiveChurn)],
      ["Customer Acquisition Cost (CAC)", fmtUsd(inp.cac)],
    ],
    colWidths: [40, 20],
  }

  const resultsSheet: SheetSpec = {
    name: "Results",
    title: "Unit Economics — Results",
    headers: ["Metric", "Value", "Healthy when"],
    rows: [
      ["Monthly contribution per customer", fmtUsd(r.monthlyContribution, 2), "≥ 0"],
      ["Customer lifetime (months)", r.customerLifetimeMonths.toFixed(1), "≥ 24"],
      ["LTV", fmtUsd(r.ltv), "—"],
      ["LTV : CAC", r.ltvCacRatio.toFixed(2) + "×", "≥ 3×"],
      ["Payback period (months)", isFinite(r.paybackMonths) ? r.paybackMonths.toFixed(1) : "∞", "≤ 12"],
      ["Burn per new customer (CAC − M1 contribution)", fmtUsd(r.burnPerCustomer), "—"],
      ["Health", r.health.toUpperCase(), "great / good"],
    ],
    colWidths: [42, 14, 18],
  }

  const sensSheet: SheetSpec = {
    name: "Sensitivity",
    title: "LTV : CAC sensitivity — base ARPA + gross margin held constant",
    headers: sens.headers,
    rows: sens.rows,
    colWidths: [22, ...Array(sens.headers.length - 1).fill(11)],
  }

  const notesSheet: SheetSpec = {
    name: "Notes",
    title: "Notes",
    headers: ["#", "Note"],
    rows: r.notes.length ? r.notes.map((n, i) => [i + 1, n]) : [["—", "No flags. Unit economics look clean."]],
    colWidths: [4, 90],
  }

  return buildWorkbook([inputsSheet, resultsSheet, sensSheet, notesSheet])
}
