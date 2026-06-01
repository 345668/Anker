/**
 * SaaS forecast (Anker original).
 *
 * Cohort-based MRR build-up:
 *   - New customers per month (linear ramp from start to end)
 *   - ARPA (constant)
 *   - Monthly logo churn
 *   - Monthly net expansion (revenue from existing customers)
 *
 * Outputs: monthly MRR, ARR, customer count, gross revenue, COGS, gross profit.
 * 60-month horizon by default.
 */

import { buildWorkbook, fmtPct, fmtUsd, type SheetSpec } from "./xlsx-export"

export interface SaasForecastInputs {
  startingCustomers: number
  startingMrr: number
  newCustomersM1: number // new customers in month 1
  newCustomersM60: number // new customers in month 60 (linear ramp)
  arpaMonthly: number
  monthlyChurn: number // 0..1
  monthlyExpansion: number // 0..1 (rev from existing cohort growing)
  grossMargin: number // 0..1
  monthsHorizon?: number // default 60
}

export interface MonthRow {
  month: number
  newCustomers: number
  customers: number
  mrr: number
  arr: number
  churnedCustomers: number
  churnedMrr: number
  expansionMrr: number
  newMrr: number
  cogs: number
  grossProfit: number
}

export interface SaasForecastResult {
  rows: MonthRow[]
  totals: {
    finalCustomers: number
    finalArr: number
    cumulativeRevenue: number
    cumulativeGrossProfit: number
    avgMonthlyGrowth: number
  }
}

export function compute(inp: SaasForecastInputs): SaasForecastResult {
  const months = inp.monthsHorizon ?? 60
  const rows: MonthRow[] = []
  let customers = inp.startingCustomers
  let mrr = inp.startingMrr || customers * inp.arpaMonthly

  let cumulativeRevenue = 0
  let cumulativeGrossProfit = 0
  let firstMrr = mrr

  for (let m = 1; m <= months; m++) {
    // Linear interpolation of new-customer flow
    const t = months > 1 ? (m - 1) / (months - 1) : 0
    const newCustomers = Math.round(inp.newCustomersM1 + t * (inp.newCustomersM60 - inp.newCustomersM1))

    // Churn this month (customers + their MRR)
    const churnedCustomers = Math.round(customers * inp.monthlyChurn)
    const churnedMrr = mrr * inp.monthlyChurn

    // Expansion on the surviving base
    const expansionMrr = (mrr - churnedMrr) * inp.monthlyExpansion

    // New customers add MRR
    const newMrr = newCustomers * inp.arpaMonthly

    // Roll forward
    customers = customers - churnedCustomers + newCustomers
    mrr = mrr - churnedMrr + expansionMrr + newMrr
    const arr = mrr * 12

    const cogs = mrr * (1 - inp.grossMargin)
    const grossProfit = mrr - cogs
    cumulativeRevenue += mrr
    cumulativeGrossProfit += grossProfit

    rows.push({
      month: m,
      newCustomers,
      customers,
      mrr,
      arr,
      churnedCustomers,
      churnedMrr,
      expansionMrr,
      newMrr,
      cogs,
      grossProfit,
    })
  }

  const finalArr = rows[rows.length - 1].arr
  const totalGrowth = firstMrr > 0 ? Math.pow(rows[rows.length - 1].mrr / firstMrr, 1 / months) - 1 : 0

  return {
    rows,
    totals: {
      finalCustomers: rows[rows.length - 1].customers,
      finalArr,
      cumulativeRevenue,
      cumulativeGrossProfit,
      avgMonthlyGrowth: totalGrowth,
    },
  }
}

export function buildExportWorkbook(inp: SaasForecastInputs) {
  const r = compute(inp)
  const months = inp.monthsHorizon ?? 60

  const inputsSheet: SheetSpec = {
    name: "Inputs",
    title: "SaaS Forecast — Inputs",
    subtitle: `Built natively in Anker · ${months}-month horizon · ${new Date().toISOString().slice(0, 10)}`,
    headers: ["Field", "Value"],
    rows: [
      ["Starting customers", inp.startingCustomers],
      ["Starting MRR", fmtUsd(inp.startingMrr)],
      ["New customers in month 1", inp.newCustomersM1],
      [`New customers in month ${months}`, inp.newCustomersM60],
      ["ARPA — monthly", fmtUsd(inp.arpaMonthly)],
      ["Monthly logo churn", fmtPct(inp.monthlyChurn)],
      ["Monthly expansion rate (existing base)", fmtPct(inp.monthlyExpansion)],
      ["Gross margin", fmtPct(inp.grossMargin)],
    ],
    colWidths: [40, 18],
  }

  const summarySheet: SheetSpec = {
    name: "Summary",
    title: "Forecast — key outputs",
    headers: ["Metric", "Value"],
    rows: [
      [`Customers at month ${months}`, r.totals.finalCustomers],
      [`ARR at month ${months}`, fmtUsd(r.totals.finalArr)],
      [`Cumulative revenue (months 1-${months})`, fmtUsd(r.totals.cumulativeRevenue)],
      [`Cumulative gross profit`, fmtUsd(r.totals.cumulativeGrossProfit)],
      [`Avg monthly MRR growth (CAGR-style)`, fmtPct(r.totals.avgMonthlyGrowth, 2)],
    ],
    colWidths: [40, 22],
  }

  const monthlySheet: SheetSpec = {
    name: "Monthly",
    title: `Monthly forecast — ${months} months`,
    freeze: true,
    headers: [
      "Month", "New customers", "Total customers", "MRR", "ARR",
      "Churned customers", "Churned MRR", "Expansion MRR", "New-customer MRR",
      "COGS", "Gross profit",
    ],
    rows: r.rows.map((row) => [
      row.month,
      row.newCustomers,
      row.customers,
      Number(row.mrr.toFixed(2)),
      Number(row.arr.toFixed(2)),
      row.churnedCustomers,
      Number(row.churnedMrr.toFixed(2)),
      Number(row.expansionMrr.toFixed(2)),
      Number(row.newMrr.toFixed(2)),
      Number(row.cogs.toFixed(2)),
      Number(row.grossProfit.toFixed(2)),
    ]),
    colWidths: [7, 14, 14, 13, 13, 14, 14, 14, 16, 12, 13],
  }

  return buildWorkbook([inputsSheet, summarySheet, monthlySheet])
}
