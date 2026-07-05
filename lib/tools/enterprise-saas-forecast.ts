/**
 * Enterprise SaaS Forecast — sales-led pipeline model.
 *
 * Native rebuild of the Foresight "Enterprise SaaS Forecasting Tool"
 * (public/templates/Enterprise SaaS Forecasting Tool, by Foresight.xlsx).
 * The template is a named-account model: each client row carries a
 * booking (TCV), a contract length, and a revenue-recognition start;
 * the sheet then derives Bookings → Billings → Revenues and a deferred
 * -revenue roll-forward (ASC 606 style).
 *
 * The native tool keeps exactly that shape: funnel-driven new-logo
 * acquisition (pipeline → win rate → deals), ACV + contract length +
 * billing cadence, ratable recognition, deferred-revenue balance,
 * churn on renewal, and expansion on renewed logos.
 */

import { buildWorkbook, fmtUsd } from "./xlsx-export"

export interface EnterpriseSaasInputs {
  months?: number                    // default 36
  /** Qualified pipeline created in month 1 (count of opportunities). */
  startingPipelinePerMonth?: number  // default 10
  /** MoM growth of created pipeline. */
  pipelineGrowthRate?: number        // default 0.06
  /** Win rate on qualified opportunities. */
  winRate?: number                   // default 0.20
  /** Sales cycle from opportunity creation to close (months). */
  salesCycleMonths?: number          // default 3
  /** Average contract value per year (ACV). */
  acvUsd?: number                    // default 60_000
  /** Contract length in months. */
  contractLengthMonths?: number      // default 12
  /** Billing cadence: upfront = full TCV billed at signing; annual/quarterly/monthly. */
  billingCadence?: "upfront" | "annual" | "quarterly" | "monthly"
  /** Logo churn at renewal (fraction of contracts NOT renewing). */
  renewalChurnRate?: number          // default 0.10
  /** Net expansion applied to renewing contracts (0.10 = renew at 110% of prior ACV). */
  expansionOnRenewal?: number        // default 0.10
  /** Gross margin on recognized revenue. */
  grossMarginPct?: number            // default 0.78
  /** Fully-loaded sales & marketing cost per closed-won deal (CAC). */
  cacPerDealUsd?: number             // default 45_000
}

export interface EntSaasMonthRow {
  month: number
  pipelineCreated: number
  dealsWon: number
  activeClients: number
  bookings: number                   // TCV signed this month
  billings: number                   // invoiced this month
  recognizedRevenue: number          // ratable
  deferredBeginning: number
  deferredEnd: number
  arr: number                        // annualised recognized revenue run-rate
  grossProfit: number
  salesMarketingCost: number
}

export interface EnterpriseSaasResult {
  inputs: EnterpriseSaasInputs
  rows: EntSaasMonthRow[]
  finalArr: number
  totalBookings: number
  totalBillings: number
  totalRecognized: number
  finalDeferred: number
  totalClients: number
  cacPaybackMonths: number
  magicNumber: number                // net-new ARR per $ of S&M (annualised, final year)
  notes: string[]
}

const DEFAULTS: Required<EnterpriseSaasInputs> = {
  months: 36,
  startingPipelinePerMonth: 10,
  pipelineGrowthRate: 0.06,
  winRate: 0.20,
  salesCycleMonths: 3,
  acvUsd: 60_000,
  contractLengthMonths: 12,
  billingCadence: "annual",
  renewalChurnRate: 0.10,
  expansionOnRenewal: 0.10,
  grossMarginPct: 0.78,
  cacPerDealUsd: 45_000,
}

interface Contract {
  startMonth: number       // month recognition starts
  acvMonthly: number       // recognized per month
  lengthMonths: number
  tcv: number
}

export function compute(input: EnterpriseSaasInputs): EnterpriseSaasResult {
  const i = { ...DEFAULTS, ...input }
  const months = Math.max(6, Math.min(120, Math.round(i.months)))
  const clen = Math.max(1, Math.round(i.contractLengthMonths))
  const cycle = Math.max(0, Math.round(i.salesCycleMonths))

  const contracts: Contract[] = []
  const rows: EntSaasMonthRow[] = []

  let deferred = 0
  let cumBookings = 0
  let cumBillings = 0
  let cumRecognized = 0
  let cumSm = 0
  let totalClients = 0

  // Billing helper: how much of a contract's TCV is invoiced in a given
  // month-of-contract (1-indexed), by cadence.
  const billingFor = (c: Contract, monthOfContract: number): number => {
    const period =
      i.billingCadence === "upfront" ? c.lengthMonths
      : i.billingCadence === "annual" ? Math.min(12, c.lengthMonths)
      : i.billingCadence === "quarterly" ? Math.min(3, c.lengthMonths)
      : 1
    if ((monthOfContract - 1) % period !== 0) return 0
    return c.acvMonthly * Math.min(period, c.lengthMonths - monthOfContract + 1)
  }

  for (let m = 1; m <= months; m++) {
    const pipelineCreated =
      i.startingPipelinePerMonth * Math.pow(1 + i.pipelineGrowthRate, m - 1)

    // Deals created `cycle` months ago close now.
    const sourcedMonth = m - cycle
    const pipelineClosing =
      sourcedMonth >= 1
        ? i.startingPipelinePerMonth * Math.pow(1 + i.pipelineGrowthRate, sourcedMonth - 1)
        : 0
    const dealsWon = pipelineClosing * i.winRate

    // New contracts signed this month
    if (dealsWon > 0) {
      const tcv = i.acvUsd * (clen / 12)
      contracts.push({
        startMonth: m,
        acvMonthly: i.acvUsd / 12,
        lengthMonths: clen,
        tcv: tcv * dealsWon,   // pool the cohort into one weighted contract
      })
      // Scale the pooled contract: acvMonthly must reflect cohort size.
      contracts[contracts.length - 1].acvMonthly = (i.acvUsd / 12) * dealsWon
      totalClients += dealsWon
      cumBookings += tcv * dealsWon
    }

    // Renewals: contracts ending this month renew at (1-churn) with expansion.
    for (const c of [...contracts]) {
      const endMonth = c.startMonth + c.lengthMonths - 1
      if (endMonth === m - 1) {
        const renewFactor = (1 - i.renewalChurnRate) * (1 + i.expansionOnRenewal)
        if (renewFactor > 0.01) {
          const renewedMonthly = c.acvMonthly * renewFactor
          const tcv = renewedMonthly * clen
          contracts.push({
            startMonth: m,
            acvMonthly: renewedMonthly,
            lengthMonths: clen,
            tcv,
          })
          cumBookings += tcv
        }
      }
    }

    // Billings + recognition across all active contracts
    let billings = 0
    let recognized = 0
    let activeMonthlyAcv = 0
    let activeClientWeight = 0
    for (const c of contracts) {
      const moc = m - c.startMonth + 1   // month-of-contract
      if (moc >= 1 && moc <= c.lengthMonths) {
        billings += billingFor(c, moc)
        recognized += c.acvMonthly
        activeMonthlyAcv += c.acvMonthly
        activeClientWeight += c.acvMonthly / (i.acvUsd / 12)
      }
    }

    const deferredBeginning = deferred
    deferred = Math.max(0, deferred + billings - recognized)

    const dealsWonCost = dealsWon * i.cacPerDealUsd
    cumBillings += billings
    cumRecognized += recognized
    cumSm += dealsWonCost

    rows.push({
      month: m,
      pipelineCreated,
      dealsWon,
      activeClients: activeClientWeight,
      bookings: dealsWon > 0 ? i.acvUsd * (clen / 12) * dealsWon : 0,
      billings,
      recognizedRevenue: recognized,
      deferredBeginning,
      deferredEnd: deferred,
      arr: activeMonthlyAcv * 12,
      grossProfit: recognized * i.grossMarginPct,
      salesMarketingCost: dealsWonCost,
    })
  }

  const last = rows[rows.length - 1]

  // CAC payback: CAC per deal ÷ monthly gross profit per deal.
  const monthlyGrossPerDeal = (i.acvUsd / 12) * i.grossMarginPct
  const cacPaybackMonths = monthlyGrossPerDeal > 0 ? i.cacPerDealUsd / monthlyGrossPerDeal : 0

  // Magic number over the last 12 months: net-new ARR ÷ S&M spend.
  const trailing = rows.slice(-13)
  const netNewArr = trailing.length > 1 ? last.arr - trailing[0].arr : last.arr
  const smLast12 = rows.slice(-12).reduce((s, r) => s + r.salesMarketingCost, 0)
  const magicNumber = smLast12 > 0 ? netNewArr / smLast12 : 0

  const notes: string[] = []
  if (cacPaybackMonths > 24)
    notes.push("CAC payback beyond 24 months — enterprise benchmarks want <18; check ACV or CAC per deal.")
  if (i.winRate > 0.35)
    notes.push("Win rate above 35% is rare for competitive enterprise sales; typical range is 15-25%.")
  if (magicNumber < 0.5)
    notes.push("Magic number under 0.5 — each S&M dollar produces <$0.50 of net-new ARR; efficiency needs work before scaling spend.")
  if (i.renewalChurnRate > 0.15)
    notes.push("Logo churn above 15% at renewal undermines the compounding model — investigate onboarding and success coverage.")

  return {
    inputs: i,
    rows,
    finalArr: last.arr,
    totalBookings: cumBookings,
    totalBillings: cumBillings,
    totalRecognized: cumRecognized,
    finalDeferred: deferred,
    totalClients,
    cacPaybackMonths,
    magicNumber,
    notes,
  }
}

// ─── xlsx export ──────────────────────────────────────────────────────
export function buildExportWorkbook(state: EnterpriseSaasInputs) {
  const r = compute(state)

  const headers = [
    "Month", "Pipeline created", "Deals won", "Active clients",
    "Bookings (TCV)", "Billings", "Recognized revenue",
    "Deferred (beg)", "Deferred (end)", "ARR", "Gross profit", "S&M cost",
  ]
  const rows = r.rows.map((m) => [
    `M${m.month}`,
    +m.pipelineCreated.toFixed(1),
    +m.dealsWon.toFixed(1),
    +m.activeClients.toFixed(1),
    Math.round(m.bookings),
    Math.round(m.billings),
    Math.round(m.recognizedRevenue),
    Math.round(m.deferredBeginning),
    Math.round(m.deferredEnd),
    Math.round(m.arr),
    Math.round(m.grossProfit),
    Math.round(m.salesMarketingCost),
  ])

  const summary: any[][] = [
    ["Horizon", `${r.rows.length} months`],
    ["ACV", fmtUsd(state.acvUsd ?? 60_000)],
    ["Contract length", `${state.contractLengthMonths ?? 12} months`],
    ["Billing cadence", state.billingCadence ?? "annual"],
    [""],
    ["Final ARR", fmtUsd(r.finalArr)],
    ["Total bookings (TCV)", fmtUsd(r.totalBookings)],
    ["Total billings", fmtUsd(r.totalBillings)],
    ["Total recognized revenue", fmtUsd(r.totalRecognized)],
    ["Deferred revenue, end", fmtUsd(r.finalDeferred)],
    ["Clients won", Math.round(r.totalClients)],
    [""],
    ["CAC payback", `${r.cacPaybackMonths.toFixed(1)} months`],
    ["Magic number (last 12 mo)", r.magicNumber.toFixed(2)],
  ]

  return buildWorkbook([
    {
      name: "Summary",
      title: "Anker — Enterprise SaaS Forecast",
      subtitle: "Sales-led pipeline · bookings → billings → revenue · deferred-revenue roll-forward",
      rows: summary,
      colWidths: [30, 22],
    },
    {
      name: "Monthly model",
      headers,
      rows,
      colWidths: [7, 15, 11, 13, 14, 12, 17, 14, 14, 13, 12, 12],
      freeze: true,
    },
  ])
}
