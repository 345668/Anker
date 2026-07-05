/**
 * Fund of Funds — multi-sub-fund allocator model.
 *
 * Native rebuild of the Foresight "Fund of Funds Model"
 * (public/templates/Fund of Funds Model, by Foresight.xlsx).
 * Follows the sheet's structure: a FoF with committed capital, fees,
 * and carry commits to N sub-funds over a commitment window; each
 * sub-fund runs the template's baseline profile (capital calls over an
 * investment period, J-curve NAV, distributions from year `firstDistYear`
 * at a gross multiple derived from the exit-type mix), and the FoF
 * aggregates the cashflows into portfolio TVPI / DPI and net IRR.
 *
 * The template's exit-type mix (writeoff / small / medium / large) is
 * carried over directly as the driver of the average sub-fund multiple.
 */

import { buildWorkbook, fmtUsd } from "./xlsx-export"

export interface FundOfFundsInputs {
  fofSizeUsd?: number               // default 100M
  fofLifeYears?: number             // default 14
  commitmentPeriodYears?: number    // default 3
  numSubFunds?: number              // default 20
  /** FoF-level management fee (on committed during commitment period, on NAV after). */
  fofMgmtFeePct?: number            // default 0.01 (FoFs charge ~0.5-1%)
  fofCarryPct?: number              // default 0.05 (FoF carry is typically 5-10%)
  fofOrgExpensesUsd?: number        // default 150k one-time
  fofAnnualOpexUsd?: number         // default 100k
  // Sub-fund baseline (the "average fund" the FoF buys)
  subFundCommitmentUsd?: number     // default = deployable / numSubFunds
  subFundInvestPeriodYears?: number // default 4
  subFundMgmtFeePct?: number        // default 0.02
  subFundCarryPct?: number          // default 0.20
  /** Exit-type mix — drives the sub-fund's gross multiple. Fractions should sum to 1. */
  pctWriteoff?: number              // default 0.60
  pctSmall?: number                 // default 0.20  (2× money)
  pctMedium?: number                // default 0.10  (5× money)
  pctLarge?: number                 // default 0.10  (15× money)
  /** Year (relative to each sub-fund's vintage) distributions start. */
  firstDistYear?: number            // default 5
  /** Years over which a sub-fund distributes once it starts. */
  distributionYears?: number        // default 6
}

export interface FofYearRow {
  year: number
  commitments: number               // new commitments to sub-funds
  capitalCalled: number             // LP capital called by the FoF
  subFundCalls: number              // capital the sub-funds called from the FoF
  fofFees: number
  distributionsReceived: number     // from sub-funds, gross of FoF carry
  distributionsToLps: number
  nav: number
  dpi: number
  tvpi: number
}

export interface FundOfFundsResult {
  inputs: FundOfFundsInputs
  rows: FofYearRow[]
  subFundGrossMultiple: number      // implied by exit mix
  subFundNetMultiple: number        // after sub-fund fees + carry
  totalCalled: number
  totalDistributed: number
  totalFofFees: number
  totalFofCarry: number
  finalDpi: number
  finalTvpi: number
  netIrr: number
  effectiveSubFundCommitment: number
  notes: string[]
}

const DEFAULTS: Required<Omit<FundOfFundsInputs, "subFundCommitmentUsd">> = {
  fofSizeUsd: 100_000_000,
  fofLifeYears: 14,
  commitmentPeriodYears: 3,
  numSubFunds: 20,
  fofMgmtFeePct: 0.01,
  fofCarryPct: 0.05,
  fofOrgExpensesUsd: 150_000,
  fofAnnualOpexUsd: 100_000,
  subFundInvestPeriodYears: 4,
  subFundMgmtFeePct: 0.02,
  subFundCarryPct: 0.20,
  pctWriteoff: 0.60,
  pctSmall: 0.20,
  pctMedium: 0.10,
  pctLarge: 0.10,
  firstDistYear: 5,
  distributionYears: 6,
}

// Money multiples per exit type — same buckets the template uses.
const EXIT_MULTIPLES = { writeoff: 0.1, small: 2, medium: 5, large: 15 }

export function compute(input: FundOfFundsInputs): FundOfFundsResult {
  const i = { ...DEFAULTS, ...input } as Required<FundOfFundsInputs> & { subFundCommitmentUsd?: number }
  const years = Math.max(8, Math.min(20, Math.round(i.fofLifeYears)))
  const numFunds = Math.max(1, Math.round(i.numSubFunds))

  // Normalise exit mix
  const mixSum = i.pctWriteoff + i.pctSmall + i.pctMedium + i.pctLarge || 1
  const mix = {
    writeoff: i.pctWriteoff / mixSum,
    small: i.pctSmall / mixSum,
    medium: i.pctMedium / mixSum,
    large: i.pctLarge / mixSum,
  }
  // Gross multiple on the sub-fund's invested capital
  const subGross =
    mix.writeoff * EXIT_MULTIPLES.writeoff +
    mix.small * EXIT_MULTIPLES.small +
    mix.medium * EXIT_MULTIPLES.medium +
    mix.large * EXIT_MULTIPLES.large

  // Sub-fund net-to-LP multiple: fees reduce investable capital; carry
  // takes a cut of gains. Template assumes 100% fee recycling, which we
  // mirror by treating invested ≈ committed and charging carry on gains.
  const subInvestedPerCommitted = 1.0 // recycled fees → fully invested
  const subProceedsPerCommitted = subInvestedPerCommitted * subGross
  const subGainsPerCommitted = Math.max(0, subProceedsPerCommitted - 1)
  const subCarryPerCommitted = subGainsPerCommitted * i.subFundCarryPct
  const subNetPerCommitted = subProceedsPerCommitted - subCarryPerCommitted
  const subNetMultiple = subNetPerCommitted

  // FoF budget: committed capital minus FoF fees/expenses is deployable.
  const totalFofFeesEst =
    i.fofOrgExpensesUsd +
    i.fofAnnualOpexUsd * years +
    i.fofMgmtFeePct * i.fofSizeUsd * Math.min(years, 12)
  const deployable = Math.max(0, i.fofSizeUsd - totalFofFeesEst)
  const perFund =
    i.subFundCommitmentUsd && i.subFundCommitmentUsd > 0
      ? i.subFundCommitmentUsd
      : deployable / numFunds

  // Vintages: sub-fund commitments spread evenly over the commitment period.
  const fundsPerYear = numFunds / Math.max(1, i.commitmentPeriodYears)

  const rows: FofYearRow[] = []
  let cumCalled = 0
  let cumDistToLps = 0
  let nav = 0
  let totalFofFees = 0
  let totalSubDistributions = 0
  const netFlows: { year: number; amount: number }[] = []

  for (let y = 1; y <= years; y++) {
    // New commitments
    const commitments = y <= i.commitmentPeriodYears ? fundsPerYear * perFund : 0

    // Sub-fund capital calls: each vintage calls its commitment evenly
    // over its investment period.
    let subFundCalls = 0
    for (let v = 1; v <= Math.min(y, i.commitmentPeriodYears); v++) {
      const age = y - v + 1
      if (age >= 1 && age <= i.subFundInvestPeriodYears) {
        subFundCalls += (fundsPerYear * perFund) / i.subFundInvestPeriodYears
      }
    }

    // FoF fees
    const feeBase = y <= i.commitmentPeriodYears + i.subFundInvestPeriodYears ? i.fofSizeUsd : nav
    const fofFees =
      (y === 1 ? i.fofOrgExpensesUsd : 0) +
      i.fofAnnualOpexUsd +
      (y <= 12 ? feeBase * i.fofMgmtFeePct : 0)

    // Distributions from sub-funds: each vintage distributes its net
    // proceeds evenly across `distributionYears`, starting at firstDistYear.
    let distributionsReceived = 0
    for (let v = 1; v <= Math.min(y, i.commitmentPeriodYears); v++) {
      const age = y - v + 1
      if (age >= i.firstDistYear && age < i.firstDistYear + i.distributionYears) {
        const vintageCommit = fundsPerYear * perFund
        distributionsReceived += (vintageCommit * subNetMultiple) / i.distributionYears
      }
    }
    totalSubDistributions += distributionsReceived

    // FoF carry on gains (deducted from distributions as they flow, once
    // cumulative distributions exceed called capital — European waterfall).
    const calledThisYear = subFundCalls + fofFees
    cumCalled += calledThisYear

    let carryThisYear = 0
    const cumReceivedBefore = totalSubDistributions - distributionsReceived
    const gainsBefore = Math.max(0, cumReceivedBefore - cumCalled)
    const gainsAfter = Math.max(0, totalSubDistributions - cumCalled)
    carryThisYear = (gainsAfter - gainsBefore) * i.fofCarryPct
    const distributionsToLps = distributionsReceived - carryThisYear
    cumDistToLps += distributionsToLps

    // NAV roll-forward: called capital in the ground grows toward the
    // net multiple linearly across the distribution window (simple
    // J-curve: flat-to-down early from fees, up later).
    const investedToDate = rows.reduce((s, r) => s + r.subFundCalls, 0) + subFundCalls
    const returnedShare = subNetMultiple > 0 ? totalSubDistributions / (perFund * numFunds * subNetMultiple) : 0
    nav = Math.max(0, investedToDate * (1 - returnedShare) * (1 + Math.max(0, subGross - 1) * 0.35))

    totalFofFees += fofFees
    netFlows.push({ year: y, amount: distributionsToLps - calledThisYear })

    rows.push({
      year: y,
      commitments,
      capitalCalled: calledThisYear,
      subFundCalls,
      fofFees,
      distributionsReceived,
      distributionsToLps,
      nav,
      dpi: cumCalled > 0 ? cumDistToLps / cumCalled : 0,
      tvpi: cumCalled > 0 ? (cumDistToLps + nav) / cumCalled : 0,
    })
  }

  // Wind-down: residual NAV distributes at face value in the final year.
  const residual = nav
  cumDistToLps += residual
  netFlows.push({ year: years, amount: residual })

  const finalDpi = cumCalled > 0 ? cumDistToLps / cumCalled : 0
  const finalTvpi = finalDpi
  const netIrr = irr(netFlows)
  const totalFofCarry = Math.max(0, totalSubDistributions + residual - cumCalled) * i.fofCarryPct

  const notes: string[] = []
  if (i.fofCarryPct > 0.10)
    notes.push("FoF carry above 10% is aggressive — institutional FoF terms cluster at 5% carry / 0.5-1% fee.")
  if (subGross < 2.5)
    notes.push("Exit mix implies a sub-fund gross multiple under 2.5× — the double fee layer will push LP net returns below public-market equivalents.")
  if (numFunds < 10)
    notes.push("Fewer than 10 sub-funds keeps single-manager risk high; diversification is the main reason LPs accept the second fee layer.")
  if (finalTvpi < 1.6)
    notes.push("Portfolio TVPI under 1.6× net rarely clears an LP's venture hurdle after illiquidity — revisit manager selection assumptions.")

  return {
    inputs: i,
    rows,
    subFundGrossMultiple: subGross,
    subFundNetMultiple: subNetMultiple,
    totalCalled: cumCalled,
    totalDistributed: cumDistToLps,
    totalFofFees,
    totalFofCarry,
    finalDpi,
    finalTvpi,
    netIrr,
    effectiveSubFundCommitment: perFund,
    notes,
  }
}

function irr(flows: { year: number; amount: number }[]): number {
  if (!flows.length) return 0
  const npv = (rate: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, f.year), 0)
  let r0 = 0.03, r1 = 0.15
  let n0 = npv(r0), n1 = npv(r1)
  for (let k = 0; k < 80; k++) {
    if (Math.abs(n1) < 1) return r1
    if (n1 === n0) break
    const r2 = Math.max(-0.95, Math.min(5, r1 - n1 * (r1 - r0) / (n1 - n0)))
    r0 = r1; n0 = n1; r1 = r2; n1 = npv(r1)
  }
  return r1
}

// ─── xlsx export ──────────────────────────────────────────────────────
export function buildExportWorkbook(state: FundOfFundsInputs) {
  const r = compute(state)

  const headers = [
    "Year", "New commitments", "Capital called", "Sub-fund calls",
    "FoF fees", "Distributions rec'd", "Distributions to LPs",
    "NAV", "DPI", "TVPI",
  ]
  const rows = r.rows.map((y) => [
    `Y${y.year}`,
    Math.round(y.commitments),
    Math.round(y.capitalCalled),
    Math.round(y.subFundCalls),
    Math.round(y.fofFees),
    Math.round(y.distributionsReceived),
    Math.round(y.distributionsToLps),
    Math.round(y.nav),
    +y.dpi.toFixed(2),
    +y.tvpi.toFixed(2),
  ])

  const summary: any[][] = [
    ["FoF size", fmtUsd(state.fofSizeUsd ?? 100_000_000)],
    ["Sub-funds", state.numSubFunds ?? 20],
    ["Commitment per sub-fund", fmtUsd(r.effectiveSubFundCommitment)],
    ["Commitment period", `${state.commitmentPeriodYears ?? 3} years`],
    [""],
    ["Sub-fund gross multiple (exit mix)", `${r.subFundGrossMultiple.toFixed(2)}×`],
    ["Sub-fund net multiple (after 2/20)", `${r.subFundNetMultiple.toFixed(2)}×`],
    [""],
    ["Total called", fmtUsd(r.totalCalled)],
    ["Total distributed to LPs", fmtUsd(r.totalDistributed)],
    ["Total FoF fees", fmtUsd(r.totalFofFees)],
    ["Estimated FoF carry", fmtUsd(r.totalFofCarry)],
    [""],
    ["Final DPI", `${r.finalDpi.toFixed(2)}×`],
    ["Final TVPI", `${r.finalTvpi.toFixed(2)}×`],
    ["Net IRR", `${(r.netIrr * 100).toFixed(1)}%`],
  ]

  return buildWorkbook([
    {
      name: "Summary",
      title: "Anker — Fund of Funds Model",
      subtitle: "Multi-sub-fund allocator · J-curve aggregation · double fee layer",
      rows: summary,
      colWidths: [34, 22],
    },
    {
      name: "Annual model",
      headers,
      rows,
      colWidths: [7, 16, 15, 15, 12, 18, 19, 14, 8, 8],
      freeze: true,
    },
  ])
}
