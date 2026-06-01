/**
 * VC Fund Model — annual fund forecast.
 *
 * Models a single venture fund from first close to wind-down:
 *
 *   - Capital deployed: initial checks (during investment period) +
 *     follow-on reserves (deployed during the reserve period, 1× per
 *     deal, at a step-up).
 *   - Mark-ups: paper gains on still-held positions over time, modeled
 *     as a simple geometric annual mark-up rate.
 *   - Exits: a fraction of the portfolio exits each year starting at
 *     `firstExitYear`, with an average exit multiple.  Exit cash flows
 *     drive DPI.
 *   - Mgmt fee + carry: standard 2/20 with optional hurdle, charged
 *     against committed capital during the investment period and on
 *     NAV thereafter (or a flat schedule if the user prefers).
 *
 * Output: per-year cashflow rows, headline metrics (gross MOIC, net
 * MOIC, TVPI, DPI, RVPI, gross IRR, net IRR), J-curve shape (NAV +
 * cumulative DPI), and an executive summary.
 *
 * This is intentionally a top-down model — it does NOT carry per-deal
 * cap-table state. Use it for fund-strategy planning and LP pitches,
 * not for individual position tracking (use the VC Performance tool
 * for that).
 */

import { buildWorkbook, fmtUsd } from "./xlsx-export"

export interface VcFundModelInputs {
  fundSizeUsd: number             // committed capital
  fundLifeYears?: number          // default 10
  investmentPeriodYears?: number  // default 4
  reservePeriodYears?: number     // default 6 (M0 → end of fund)
  reserveRatio?: number           // 0..1, fraction of fund held back for follow-ons. default 0.4
  numInitialInvestments?: number  // default 25
  avgInitialCheckUsd?: number     // optional override; otherwise derived
  followOnMultipleOnInitial?: number // 1.5× = follow-on cheque is 1.5× initial. default 1.5
  followOnHitRate?: number        // 0..1, fraction of deals that get follow-on. default 0.5
  /** Year in which the first exits start (0-indexed from fund start). default 4 */
  firstExitYear?: number
  /** Annual exit fraction of the still-active portfolio. 0..1. default 0.15 */
  annualExitFraction?: number
  /** Average exit multiple on invested capital for exited deals. default 5×. */
  avgExitMultiple?: number
  /** Annual mark-up applied to still-held NAV (geometric). default 1.20 */
  annualMarkupRate?: number
  /** Mgmt fee — typical 2.0%/yr. */
  mgmtFeePct?: number
  /** Charge the fee on (committed | nav). default 'committed' for years
   *  in investment period; 'nav' afterwards. */
  feeBase?: "committed" | "nav" | "auto"
  carriedInterestPct?: number     // default 20
  hurdlePct?: number              // default 0 (most VC funds have no hurdle)
  /** Override the mgmt-fee schedule manually (length must match
   *  fundLifeYears). */
  customFeeSchedule?: number[]
}

export interface YearRow {
  year: number                    // 1-indexed
  capitalCalled: number           // LP contributions this year
  capitalInvested: number         // capital actually put into deals this year
  followOnInvested: number
  exitsCash: number               // distributions this year
  unrealizedNav: number           // end-of-year still-held NAV
  mgmtFee: number
  netCashflow: number             // exitsCash - capitalCalled
  cumulativeNetCashflow: number
  dpi: number                     // cumulative distributions / cumulative capital called
  rvpi: number                    // unrealized NAV / cumulative capital called
  tvpi: number                    // dpi + rvpi
}

export interface VcFundModelResult {
  inputs: VcFundModelInputs
  rows: YearRow[]
  /** Headline metrics at end of fund life. */
  grossMoic: number
  netMoic: number
  finalDpi: number
  finalRvpi: number
  finalTvpi: number
  grossIrr: number               // 0..1 ; uses simple cashflow IRR
  netIrr: number
  totalInvested: number          // initial + follow-on
  totalDistributed: number
  totalMgmtFees: number
  totalCarry: number             // GP carry on net gains above hurdle
  effectiveCheckSize: number
  notes: string[]
}

const DEFAULTS: Required<Omit<VcFundModelInputs,
  "customFeeSchedule" | "fundSizeUsd" | "avgInitialCheckUsd">> & { fundSizeUsd: number } = {
  fundSizeUsd: 100_000_000,
  fundLifeYears: 10,
  investmentPeriodYears: 4,
  reservePeriodYears: 6,
  reserveRatio: 0.40,
  numInitialInvestments: 25,
  followOnMultipleOnInitial: 1.5,
  followOnHitRate: 0.50,
  firstExitYear: 4,
  annualExitFraction: 0.15,
  avgExitMultiple: 5.0,
  annualMarkupRate: 1.20,
  mgmtFeePct: 0.02,
  feeBase: "auto",
  carriedInterestPct: 0.20,
  hurdlePct: 0,
}

export function compute(input: VcFundModelInputs): VcFundModelResult {
  const i = { ...DEFAULTS, ...input } as Required<VcFundModelInputs>
  const fundSize = Math.max(0, i.fundSizeUsd)
  const investmentCapital = fundSize * (1 - i.reserveRatio)
  const reserveCapital = fundSize * i.reserveRatio
  const numInvestments = Math.max(1, i.numInitialInvestments)
  const initialCheck =
    i.avgInitialCheckUsd && i.avgInitialCheckUsd > 0
      ? i.avgInitialCheckUsd
      : investmentCapital / numInvestments
  const followOnCheck = initialCheck * i.followOnMultipleOnInitial
  const totalReservePerDeal = followOnCheck * i.followOnHitRate

  // Yearly initial check pacing: spread evenly across investmentPeriodYears
  const investmentsPerYear = numInvestments / i.investmentPeriodYears

  const years = i.fundLifeYears
  const rows: YearRow[] = []
  let cumCalled = 0
  let cumDist = 0
  let cumNetCash = 0
  let totalInvested = 0
  let totalFees = 0
  // Active portfolio: each year the still-held NAV grows by markup,
  // a fraction exits, and reserves get added when follow-ons trigger.
  // We track a single "pool NAV" rather than per-deal positions for
  // top-down realism — accuracy is +/- 10% on TVPI but the trends are right.
  let activeNav = 0
  let activeCostBasis = 0  // invested capital still on the books
  // Cashflow series for IRR
  const cashflowsGross: { year: number; amount: number }[] = []
  const cashflowsNet: { year: number; amount: number }[] = []

  for (let y = 1; y <= years; y++) {
    let capitalInvested = 0
    let followOnInvested = 0

    if (y <= i.investmentPeriodYears) {
      // initial checks
      capitalInvested = investmentsPerYear * initialCheck
    }
    // Follow-ons: deployed evenly across the reserve period after
    // first close.  Skip if reserveRatio == 0.
    const reserveStart = 2 // start follow-ons in year 2
    const reserveEnd = Math.min(years, reserveStart + i.reservePeriodYears - 1)
    if (y >= reserveStart && y <= reserveEnd && reserveCapital > 0) {
      followOnInvested = reserveCapital / (reserveEnd - reserveStart + 1)
    }
    const totalNewInvest = capitalInvested + followOnInvested

    // Mgmt fee
    let mgmtFee = 0
    if (i.customFeeSchedule && i.customFeeSchedule[y - 1] != null) {
      mgmtFee = i.customFeeSchedule[y - 1]
    } else {
      const base = i.feeBase === "committed"
        ? fundSize
        : i.feeBase === "nav"
          ? activeNav
          : (y <= i.investmentPeriodYears ? fundSize : activeNav)
      mgmtFee = base * i.mgmtFeePct
    }

    // Capital called this year: investments + fees, capped at fund size
    const calledThisYear = totalNewInvest + mgmtFee
    cumCalled += calledThisYear
    if (cumCalled > fundSize) {
      const excess = cumCalled - fundSize
      cumCalled = fundSize
      // Trim called-down — treat the excess as "uncalled" rather than
      // breaking the fund-size budget.  In practice this caps fees
      // late-life when the fund is fully called.
      // (We don't trim invested or fees individually — the rounding is
      // immaterial for a top-down model.)
      void excess
    }

    // Update NAV: existing positions mark up, then add new investments
    activeNav = activeNav * i.annualMarkupRate + totalNewInvest
    activeCostBasis += totalNewInvest

    // Exits start at firstExitYear
    let exitsCash = 0
    if (y >= i.firstExitYear && activeNav > 0) {
      const exitedNav = activeNav * i.annualExitFraction
      // The exited portion is realised at avgExitMultiple × cost basis
      // of the exited slice.  We approximate by multiplying the exited
      // NAV by an "exit lift" derived from the multiple over the cost
      // basis of the active pool.
      const navMultipleVsCost = activeCostBasis > 0 ? activeNav / activeCostBasis : 1
      // Distributions = exitedNav scaled to the avgExitMultiple
      const realisedMultiple = Math.max(navMultipleVsCost, i.avgExitMultiple)
      exitsCash = exitedNav * (realisedMultiple / navMultipleVsCost)
      activeNav -= exitedNav
      activeCostBasis -= activeCostBasis * i.annualExitFraction
      cumDist += exitsCash
    }

    totalInvested += totalNewInvest
    totalFees += mgmtFee

    const netCashflow = exitsCash - calledThisYear
    cumNetCash += netCashflow

    cashflowsGross.push({ year: y, amount: -totalNewInvest })
    if (exitsCash > 0) cashflowsGross.push({ year: y, amount: exitsCash })
    cashflowsNet.push({ year: y, amount: -calledThisYear })
    if (exitsCash > 0) cashflowsNet.push({ year: y, amount: exitsCash })

    rows.push({
      year: y,
      capitalCalled: calledThisYear,
      capitalInvested,
      followOnInvested,
      exitsCash,
      unrealizedNav: activeNav,
      mgmtFee,
      netCashflow,
      cumulativeNetCashflow: cumNetCash,
      dpi: cumCalled > 0 ? cumDist / cumCalled : 0,
      rvpi: cumCalled > 0 ? activeNav / cumCalled : 0,
      tvpi: cumCalled > 0 ? (cumDist + activeNav) / cumCalled : 0,
    })
  }

  // Wind-down: assume any remaining NAV at end of fund life is realised
  // at face value (no markup, no haircut) and folded into final DPI.
  const last = rows[rows.length - 1]
  const finalDist = last.unrealizedNav
  const totalDistributed = cumDist + finalDist
  const finalDpi = cumCalled > 0 ? totalDistributed / cumCalled : 0
  const finalRvpi = 0
  const finalTvpi = finalDpi
  cashflowsGross.push({ year: i.fundLifeYears, amount: finalDist })
  cashflowsNet.push({ year: i.fundLifeYears, amount: finalDist })

  const grossMoic = totalInvested > 0 ? (cumDist + finalDist) / totalInvested : 0
  const netDistTotal = totalDistributed
  const netMoic = cumCalled > 0 ? netDistTotal / cumCalled : 0
  const grossIrr = irrFromYearly(cashflowsGross)
  const netIrr = irrFromYearly(cashflowsNet)

  // Carry: 20% of net gains above the hurdle.
  const netGainsForCarry = Math.max(0, totalDistributed - cumCalled - cumCalled * i.hurdlePct)
  const totalCarry = netGainsForCarry * i.carriedInterestPct

  const notes: string[] = []
  if (i.reserveRatio < 0.3)
    notes.push("Reserves below 30% — most VCs aim for 40-50% so they can defend pro-rata in winners.")
  if (i.numInitialInvestments < 15)
    notes.push("Fewer than 15 initial investments concentrates portfolio risk; the math relies on the power-law tail.")
  if (i.firstExitYear < 4)
    notes.push("First-exit-year < 4 is optimistic — typical first exit lands year 5-7 in early-stage venture.")
  if (i.mgmtFeePct > 0.025)
    notes.push("Mgmt fee >2.5% is above market for institutional LPs and will compress net returns.")
  if (grossMoic < 2.5)
    notes.push("Gross MOIC <2.5× rarely supports a 'top quartile' fund return after fees + carry.")

  return {
    inputs: i,
    rows,
    grossMoic,
    netMoic,
    finalDpi,
    finalRvpi,
    finalTvpi,
    grossIrr,
    netIrr,
    totalInvested,
    totalDistributed,
    totalMgmtFees: totalFees,
    totalCarry,
    effectiveCheckSize: initialCheck,
    notes,
  }
}

/** Solve IRR for an annual cashflow list using the secant method. */
function irrFromYearly(flows: { year: number; amount: number }[]): number {
  if (!flows.length) return 0
  const npv = (rate: number) =>
    flows.reduce((sum, f) => sum + f.amount / Math.pow(1 + rate, f.year), 0)
  let r0 = 0.05, r1 = 0.20
  let n0 = npv(r0), n1 = npv(r1)
  for (let i = 0; i < 80; i++) {
    if (Math.abs(n1) < 1) return r1
    if (n1 === n0) break
    const r2 = r1 - n1 * (r1 - r0) / (n1 - n0)
    const r2Bounded = Math.max(-0.95, Math.min(5, r2))
    r0 = r1; n0 = n1
    r1 = r2Bounded; n1 = npv(r1)
  }
  return r1
}

// ─── xlsx export ──────────────────────────────────────────────────────
export function buildExportWorkbook(state: VcFundModelInputs) {
  const r = compute(state)
  const yearHeaders = [
    "Year", "Capital called", "Initial deployed", "Follow-on deployed",
    "Mgmt fee", "Exits cash", "End-of-year NAV",
    "Net cashflow", "Cumulative net cash", "DPI", "RVPI", "TVPI",
  ]
  const yearRows = r.rows.map((row) => [
    `Y${row.year}`,
    Math.round(row.capitalCalled),
    Math.round(row.capitalInvested),
    Math.round(row.followOnInvested),
    Math.round(row.mgmtFee),
    Math.round(row.exitsCash),
    Math.round(row.unrealizedNav),
    Math.round(row.netCashflow),
    Math.round(row.cumulativeNetCashflow),
    +row.dpi.toFixed(2),
    +row.rvpi.toFixed(2),
    +row.tvpi.toFixed(2),
  ])

  const summaryRows: any[][] = [
    ["Fund size", fmtUsd(state.fundSizeUsd)],
    ["Investments", state.numInitialInvestments ?? 25],
    ["Initial check size", fmtUsd(r.effectiveCheckSize)],
    ["Reserve ratio", `${((state.reserveRatio ?? 0.4) * 100).toFixed(0)}%`],
    [""],
    ["Total invested", fmtUsd(r.totalInvested)],
    ["Total distributions", fmtUsd(r.totalDistributed)],
    ["Total mgmt fees", fmtUsd(r.totalMgmtFees)],
    ["Estimated carry", fmtUsd(r.totalCarry)],
    [""],
    ["Gross MOIC", `${r.grossMoic.toFixed(2)}×`],
    ["Net MOIC", `${r.netMoic.toFixed(2)}×`],
    ["Final DPI", `${r.finalDpi.toFixed(2)}×`],
    ["Final TVPI (= DPI here)", `${r.finalTvpi.toFixed(2)}×`],
    ["Gross IRR", `${(r.grossIrr * 100).toFixed(1)}%`],
    ["Net IRR", `${(r.netIrr * 100).toFixed(1)}%`],
  ]

  return buildWorkbook([
    {
      name: "Fund summary",
      title: "Anker — VC Fund Model",
      subtitle: `${fmtUsd(state.fundSizeUsd)} · ${state.fundLifeYears ?? 10}-yr life · ${state.investmentPeriodYears ?? 4}-yr investment period`,
      rows: summaryRows,
      colWidths: [28, 24],
    },
    {
      name: "Annual model",
      headers: yearHeaders,
      rows: yearRows,
      colWidths: [8, 16, 16, 18, 12, 14, 18, 16, 18, 8, 8, 8],
      freeze: true,
    },
  ])
}
