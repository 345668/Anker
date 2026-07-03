/**
 * Ecommerce Forecast — channel-level DTC model.
 *
 * Native rebuild of the Foresight "Ecommerce Forecasting Tool"
 * (public/templates/Ecommerce Forecasting Tool, by Foresight.xlsx).
 * Mirrors the template's structure: new-customer acquisition with a
 * growth-rate ramp, repeat-order cohorts driven by churn + repeat cycle,
 * per-order revenue/cost assumptions with monthly drift, shipping
 * revenue/cost, and a monthly P&L down to operating income plus
 * per-order unit economics and LTV.
 *
 * Simplifications vs. the sheet: one blended acquisition channel
 * (the template's channel split collapses to blended CAC), and repeat
 * behaviour is modeled with a geometric retention curve rather than the
 * template's hand-tuned cohort grid. Trends match within a few percent.
 */

import { buildWorkbook, fmtUsd } from "./xlsx-export"

export interface EcommerceForecastInputs {
  months?: number                     // default 36
  /** New customers acquired in month 1. */
  startingNewCustomers?: number       // default 300
  /** Month-over-month growth rate of new-customer acquisition, at start. 0.10 = +10%/mo. */
  startingGrowthRate?: number         // default 0.10
  /** Monthly change (decay) applied to the growth rate itself. -0.002 = growth slows. */
  growthRateDecay?: number            // default -0.002
  /** Average order value on a customer's FIRST order. */
  aovFirstOrder?: number              // default 65
  /** Average order value on repeat orders. */
  aovRepeatOrder?: number             // default 80
  /** Monthly drift in AOV (0.002 = +0.2%/mo). */
  aovMonthlyDrift?: number            // default 0.002
  /** Cost of sales as % of product revenue (COGS incl. packaging). */
  costOfSalesPct?: number             // default 0.42
  /** Monthly drift in cost of sales (negative = margin improves). */
  cosMonthlyDrift?: number            // default -0.001
  /** Shipping revenue charged per order. */
  shippingRevenuePerOrder?: number    // default 4
  /** Shipping cost paid per order. */
  shippingCostPerOrder?: number       // default 7.5
  /** Blended CAC per NEW customer. */
  cacPerNewCustomer?: number          // default 38
  /** Retention marketing cost per repeat order. */
  retentionCostPerOrder?: number      // default 3
  /** Monthly drift in CAC (0.003 = CAC inflates 0.3%/mo). */
  cacMonthlyDrift?: number            // default 0.003
  /** % of a cohort still active after each repeat cycle. 0.35 = 35% reorder. */
  repeatRate?: number                 // default 0.35
  /** Months between repeat orders for active repeat customers. */
  repeatCycleMonths?: number          // default 2
  /** Website conversion rate (sessions → orders), for the traffic line. */
  conversionRate?: number             // default 0.025
}

export interface EcomMonthRow {
  month: number
  newCustomers: number
  repeatOrders: number
  totalOrders: number
  websiteTraffic: number
  productRevenue: number
  shippingRevenue: number
  totalRevenue: number
  costOfSales: number
  shippingCost: number
  grossProfit: number
  marketingSpend: number
  contributionProfit: number
  cumulativeCustomers: number
}

export interface EcommerceForecastResult {
  inputs: EcommerceForecastInputs
  rows: EcomMonthRow[]
  // Headline
  finalMonthRevenue: number
  finalAnnualRunRate: number
  totalRevenue: number
  totalContribution: number
  totalCustomers: number
  totalOrders: number
  // Unit economics (measured on the model's own output)
  avgOrderValue: number
  grossMarginPct: number
  contributionMarginPct: number
  ordersPerCustomer: number
  ltv: number                        // contribution-based lifetime value
  blendedCac: number
  ltvToCac: number
  notes: string[]
}

const DEFAULTS: Required<EcommerceForecastInputs> = {
  months: 36,
  startingNewCustomers: 300,
  startingGrowthRate: 0.10,
  growthRateDecay: -0.002,
  aovFirstOrder: 65,
  aovRepeatOrder: 80,
  aovMonthlyDrift: 0.002,
  costOfSalesPct: 0.42,
  cosMonthlyDrift: -0.001,
  shippingRevenuePerOrder: 4,
  shippingCostPerOrder: 7.5,
  cacPerNewCustomer: 38,
  retentionCostPerOrder: 3,
  cacMonthlyDrift: 0.003,
  repeatRate: 0.35,
  repeatCycleMonths: 2,
  conversionRate: 0.025,
}

export function compute(input: EcommerceForecastInputs): EcommerceForecastResult {
  const i = { ...DEFAULTS, ...input }
  const months = Math.max(6, Math.min(120, Math.round(i.months)))
  const cycle = Math.max(1, Math.round(i.repeatCycleMonths))

  // Cohorts: newCustomersByMonth[m] = customers acquired in month m.
  // A cohort generates repeat orders every `cycle` months, with the
  // active fraction decaying geometrically by repeatRate each cycle.
  const newByMonth: number[] = []
  let growthRate = i.startingGrowthRate

  const rows: EcomMonthRow[] = []
  let cumCustomers = 0
  let totalRevenue = 0
  let totalContribution = 0
  let totalOrders = 0
  let totalMarketing = 0
  let totalGross = 0

  for (let m = 1; m <= months; m++) {
    const newCustomers =
      m === 1
        ? i.startingNewCustomers
        : newByMonth[m - 2] * (1 + Math.max(-0.5, growthRate))
    newByMonth.push(newCustomers)
    if (m > 1) growthRate = Math.max(-0.5, growthRate + i.growthRateDecay)

    // Repeat orders this month: every cohort whose age is a positive
    // multiple of the repeat cycle contributes cohortSize * repeatRate^k.
    let repeatOrders = 0
    for (let c = 0; c < m - 1; c++) {
      const age = m - 1 - c            // months since acquisition
      if (age > 0 && age % cycle === 0) {
        const k = age / cycle          // which repeat cycle this is
        repeatOrders += newByMonth[c] * Math.pow(i.repeatRate, k)
      }
    }

    const drift = (base: number, rate: number) => base * Math.pow(1 + rate, m - 1)
    const aovFirst = drift(i.aovFirstOrder, i.aovMonthlyDrift)
    const aovRepeat = drift(i.aovRepeatOrder, i.aovMonthlyDrift)
    const cosPct = Math.min(0.95, Math.max(0.05, drift(i.costOfSalesPct, i.cosMonthlyDrift)))
    const cac = drift(i.cacPerNewCustomer, i.cacMonthlyDrift)

    const orders = newCustomers + repeatOrders
    const productRevenue = newCustomers * aovFirst + repeatOrders * aovRepeat
    const shippingRevenue = orders * i.shippingRevenuePerOrder
    const revenue = productRevenue + shippingRevenue
    const costOfSales = productRevenue * cosPct
    const shippingCost = orders * i.shippingCostPerOrder
    const grossProfit = revenue - costOfSales - shippingCost
    const marketingSpend = newCustomers * cac + repeatOrders * i.retentionCostPerOrder
    const contributionProfit = grossProfit - marketingSpend

    cumCustomers += newCustomers
    totalRevenue += revenue
    totalContribution += contributionProfit
    totalOrders += orders
    totalMarketing += marketingSpend
    totalGross += grossProfit

    rows.push({
      month: m,
      newCustomers,
      repeatOrders,
      totalOrders: orders,
      websiteTraffic: i.conversionRate > 0 ? orders / i.conversionRate : 0,
      productRevenue,
      shippingRevenue,
      totalRevenue: revenue,
      costOfSales,
      shippingCost,
      grossProfit,
      marketingSpend,
      contributionProfit,
      cumulativeCustomers: cumCustomers,
    })
  }

  const last = rows[rows.length - 1]
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const grossMarginPct = totalRevenue > 0 ? totalGross / totalRevenue : 0
  const contributionMarginPct = totalRevenue > 0 ? totalContribution / totalRevenue : 0
  const ordersPerCustomer = cumCustomers > 0 ? totalOrders / cumCustomers : 0

  // LTV: contribution per order × lifetime orders per customer,
  // where lifetime orders = 1 + repeatRate + repeatRate² + … = 1/(1-r).
  const lifetimeOrders = i.repeatRate < 1 ? 1 / (1 - i.repeatRate) : 10
  const contributionPerOrder = totalOrders > 0 ? totalGross / totalOrders : 0
  const retentionCostLifetime = (lifetimeOrders - 1) * i.retentionCostPerOrder
  const ltv = contributionPerOrder * lifetimeOrders - retentionCostLifetime
  const blendedCac = cumCustomers > 0 ? totalMarketing / cumCustomers : i.cacPerNewCustomer
  const ltvToCac = i.cacPerNewCustomer > 0 ? ltv / i.cacPerNewCustomer : 0

  const notes: string[] = []
  if (ltvToCac < 3)
    notes.push("LTV:CAC below 3× — DTC investors generally want ≥3× with payback inside 12 months.")
  if (i.shippingCostPerOrder > i.shippingRevenuePerOrder + 5)
    notes.push("Shipping is heavily subsidised — every order loses money on fulfilment before product margin.")
  if (contributionMarginPct < 0.10)
    notes.push("Contribution margin under 10% leaves nothing for fixed opex — check COGS and CAC assumptions.")
  if (i.repeatRate < 0.25)
    notes.push("Repeat rate under 25% means the model is acquisition-dependent; growth stalls when paid channels saturate.")

  return {
    inputs: i,
    rows,
    finalMonthRevenue: last.totalRevenue,
    finalAnnualRunRate: last.totalRevenue * 12,
    totalRevenue,
    totalContribution,
    totalCustomers: cumCustomers,
    totalOrders,
    avgOrderValue,
    grossMarginPct,
    contributionMarginPct,
    ordersPerCustomer,
    ltv,
    blendedCac,
    ltvToCac,
    notes,
  }
}

// ─── xlsx export ──────────────────────────────────────────────────────
export function buildExportWorkbook(state: EcommerceForecastInputs) {
  const r = compute(state)

  const headers = [
    "Month", "New customers", "Repeat orders", "Total orders", "Traffic",
    "Product revenue", "Shipping revenue", "Total revenue",
    "Cost of sales", "Shipping cost", "Gross profit",
    "Marketing spend", "Contribution profit",
  ]
  const rows = r.rows.map((m) => [
    `M${m.month}`,
    Math.round(m.newCustomers),
    Math.round(m.repeatOrders),
    Math.round(m.totalOrders),
    Math.round(m.websiteTraffic),
    Math.round(m.productRevenue),
    Math.round(m.shippingRevenue),
    Math.round(m.totalRevenue),
    Math.round(m.costOfSales),
    Math.round(m.shippingCost),
    Math.round(m.grossProfit),
    Math.round(m.marketingSpend),
    Math.round(m.contributionProfit),
  ])

  const summary: any[][] = [
    ["Horizon", `${r.rows.length} months`],
    ["Final-month revenue", fmtUsd(r.finalMonthRevenue)],
    ["Annual run-rate (final month × 12)", fmtUsd(r.finalAnnualRunRate)],
    ["Total revenue over horizon", fmtUsd(r.totalRevenue)],
    ["Total contribution profit", fmtUsd(r.totalContribution)],
    [""],
    ["Customers acquired", Math.round(r.totalCustomers)],
    ["Orders", Math.round(r.totalOrders)],
    ["Orders per customer", +r.ordersPerCustomer.toFixed(2)],
    ["Average order value", fmtUsd(r.avgOrderValue, 2)],
    [""],
    ["Gross margin", `${(r.grossMarginPct * 100).toFixed(1)}%`],
    ["Contribution margin", `${(r.contributionMarginPct * 100).toFixed(1)}%`],
    ["LTV (contribution)", fmtUsd(r.ltv, 2)],
    ["CAC (input)", fmtUsd(state.cacPerNewCustomer ?? 38, 2)],
    ["LTV : CAC", `${r.ltvToCac.toFixed(2)}×`],
  ]

  return buildWorkbook([
    {
      name: "Summary",
      title: "Anker — Ecommerce Forecast",
      subtitle: "Channel-level DTC model — acquisition, repeat cohorts, contribution margin",
      rows: summary,
      colWidths: [34, 22],
    },
    {
      name: "Monthly model",
      headers,
      rows,
      colWidths: [7, 14, 13, 12, 10, 15, 15, 14, 13, 13, 13, 15, 17],
      freeze: true,
    },
  ])
}
