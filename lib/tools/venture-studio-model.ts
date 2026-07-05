/**
 * Venture Studio Model — 0/20/20 studio fund forecast.
 *
 * Native rebuild of the Foresight "Venture Studio Model, Annual Forecast"
 * (public/templates/Venture Studio Model, Annual Forecast, by Foresight.xlsx).
 * Two connected entities, exactly as the sheet lays out:
 *
 *   Fund   — LP capital, invests into the Studio's NewCos (and funds the
 *            studio's operating budget), charges fee + carry to LPs.
 *   Studio — launches NewCos, takes common ownership at formation,
 *            runs on the fund's studio allocation + management fees,
 *            and distributes its common-stock proceeds 80/20 with the fund.
 *
 * Exit outcomes use the template's writeoff/small/medium/large mix.
 */

import { buildWorkbook, fmtUsd } from "./xlsx-export"

export interface VentureStudioInputs {
  fundSizeUsd?: number              // default 50M
  fundLifeYears?: number            // default 10
  newInvestmentYears?: number       // default 4
  mgmtFeePct?: number               // default 0.02
  carryPct?: number                 // default 0.20
  /** % of invested capital that goes into the studio's operating company. */
  studioAllocationPct?: number      // default 0.20
  /** Companies launched per year during the investment period. */
  companiesPerYear?: number         // default 4
  /** Studio's common ownership at first financing. */
  studioCommonPct?: number          // default 0.30
  /** Fund's check into each NewCo at/around formation. */
  checkPerNewCoUsd?: number         // default 1_500_000
  /** Exit-type mix across NewCos. */
  pctWriteoff?: number              // default 0.50
  pctSmall?: number                 // default 0.25  (2×)
  pctMedium?: number                // default 0.15  (6×)
  pctLarge?: number                 // default 0.10  (20×)
  /** Year (relative to launch) a surviving NewCo exits. */
  exitYearFromLaunch?: number       // default 6
  /** Studio annual operating budget (salaries, EIRs, services). */
  studioAnnualOpexUsd?: number      // default 2_000_000
  /** Share of studio common-stock proceeds distributed to the FUND (LPs). */
  studioProceedsToFundPct?: number  // default 0.80
}

export interface StudioYearRow {
  year: number
  companiesLaunched: number
  fundInvested: number             // checks into NewCos
  studioFunding: number            // fund capital into studio opco
  mgmtFee: number
  studioOpex: number
  studioRevenue: number            // mgmt fees flowing to studio
  exitProceedsEquity: number       // fund's preferred/equity proceeds
  exitProceedsCommon: number       // studio common-stock proceeds
  distributionsToLps: number
  studioCash: number
  dpi: number
  tvpi: number
}

export interface VentureStudioResult {
  inputs: VentureStudioInputs
  rows: StudioYearRow[]
  totalCompanies: number
  totalCalled: number
  totalInvestedNewCos: number
  totalStudioFunding: number
  totalDistributions: number
  totalCarry: number
  studioGpIncome: number           // GP share of studio common proceeds
  impliedNewCoMultiple: number
  finalDpi: number
  finalTvpi: number
  netIrr: number
  notes: string[]
}

const DEFAULTS: Required<VentureStudioInputs> = {
  fundSizeUsd: 50_000_000,
  fundLifeYears: 10,
  newInvestmentYears: 4,
  mgmtFeePct: 0.02,
  carryPct: 0.20,
  studioAllocationPct: 0.20,
  companiesPerYear: 4,
  studioCommonPct: 0.30,
  checkPerNewCoUsd: 1_500_000,
  pctWriteoff: 0.50,
  pctSmall: 0.25,
  pctMedium: 0.15,
  pctLarge: 0.10,
  exitYearFromLaunch: 6,
  studioAnnualOpexUsd: 2_000_000,
  studioProceedsToFundPct: 0.80,
}

const EXIT_MULTIPLES = { writeoff: 0, small: 2, medium: 6, large: 20 }

export function compute(input: VentureStudioInputs): VentureStudioResult {
  const i = { ...DEFAULTS, ...input }
  const years = Math.max(6, Math.min(15, Math.round(i.fundLifeYears)))

  const mixSum = i.pctWriteoff + i.pctSmall + i.pctMedium + i.pctLarge || 1
  const impliedMultiple =
    (i.pctWriteoff * EXIT_MULTIPLES.writeoff +
      i.pctSmall * EXIT_MULTIPLES.small +
      i.pctMedium * EXIT_MULTIPLES.medium +
      i.pctLarge * EXIT_MULTIPLES.large) / mixSum

  // Average NewCo outcome: the fund's check returns check × multiple.
  // Studio common: at exit the studio's common stake is worth
  // (studioCommonPct diluted ~50% by later rounds) × exit value, where
  // exit value ≈ (check / assumed initial ownership 20%) × multiple.
  const assumedFundOwnershipPct = 0.20
  const dilutionFactor = 0.50

  const rows: StudioYearRow[] = []
  let cumCalled = 0
  let cumDistToLps = 0
  let studioCash = 0
  let totalInvestedNewCos = 0
  let totalStudioFunding = 0
  let totalFees = 0
  let totalCompanies = 0
  let totalCommonProceedsToGp = 0
  let carryPaid = 0
  const launchesByYear: number[] = Array(years + 1).fill(0)
  const netFlows: { year: number; amount: number }[] = []
  let residualNav = 0

  for (let y = 1; y <= years; y++) {
    const companiesLaunched = y <= i.newInvestmentYears ? i.companiesPerYear : 0
    launchesByYear[y] = companiesLaunched
    totalCompanies += companiesLaunched

    const fundInvested = companiesLaunched * i.checkPerNewCoUsd
    // Studio funding: studioAllocationPct of what's deployed, spread over the
    // investment period.
    const studioFunding =
      y <= i.newInvestmentYears
        ? (i.fundSizeUsd * i.studioAllocationPct) / i.newInvestmentYears
        : 0
    const mgmtFee = i.mgmtFeePct * i.fundSizeUsd * (y <= years ? 1 : 0)

    // Studio P&L: revenue = mgmt fee (flows to the studio as manager)
    // + studio funding; expenses = opex.
    const studioRevenue = mgmtFee
    const studioOpex = y <= years ? i.studioAnnualOpexUsd : 0
    studioCash += studioRevenue + studioFunding - studioOpex

    // Exits: cohorts launched in year v exit at v + exitYearFromLaunch - 1.
    let exitProceedsEquity = 0
    let exitProceedsCommon = 0
    for (let v = 1; v <= Math.min(y, i.newInvestmentYears); v++) {
      if (y === v + i.exitYearFromLaunch - 1) {
        const cohort = launchesByYear[v]
        // Fund's equity proceeds
        exitProceedsEquity += cohort * i.checkPerNewCoUsd * impliedMultiple
        // Studio common proceeds
        const avgExitValue =
          (i.checkPerNewCoUsd / assumedFundOwnershipPct) * impliedMultiple
        exitProceedsCommon +=
          cohort * avgExitValue * i.studioCommonPct * dilutionFactor
      }
    }

    // Distribution waterfall: equity proceeds go to the fund; carry on
    // gains above called capital (European). Studio common proceeds
    // split studioProceedsToFundPct to LPs, remainder to studio GPs.
    const calledThisYear = fundInvested + studioFunding + mgmtFee
    cumCalled += calledThisYear
    totalInvestedNewCos += fundInvested
    totalStudioFunding += studioFunding
    totalFees += mgmtFee

    const commonToFund = exitProceedsCommon * i.studioProceedsToFundPct
    const commonToGp = exitProceedsCommon - commonToFund
    totalCommonProceedsToGp += commonToGp

    const grossToFund = exitProceedsEquity + commonToFund
    // European carry: charge on the gain layer as cumulative
    // distributions cross cumulative called capital.
    const cumGrossBefore = cumDistToLps + carryPaid
    const gainsBefore = Math.max(0, cumGrossBefore - cumCalled)
    const gainsAfter = Math.max(0, cumGrossBefore + grossToFund - cumCalled)
    const carryThisYear = (gainsAfter - gainsBefore) * i.carryPct
    carryPaid += carryThisYear
    const distributionsToLps = grossToFund - carryThisYear
    cumDistToLps += distributionsToLps

    // Residual NAV: cost basis of not-yet-exited cohorts, marked at 1×
    // plus a modest markup for age.
    residualNav = 0
    for (let v = 1; v <= Math.min(y, i.newInvestmentYears); v++) {
      if (y < v + i.exitYearFromLaunch - 1) {
        const age = y - v + 1
        residualNav += launchesByYear[v] * i.checkPerNewCoUsd * Math.min(2.5, 1 + age * 0.2)
      }
    }

    netFlows.push({ year: y, amount: distributionsToLps - calledThisYear })

    rows.push({
      year: y,
      companiesLaunched,
      fundInvested,
      studioFunding,
      mgmtFee,
      studioOpex,
      studioRevenue,
      exitProceedsEquity,
      exitProceedsCommon,
      distributionsToLps,
      studioCash,
      dpi: cumCalled > 0 ? cumDistToLps / cumCalled : 0,
      tvpi: cumCalled > 0 ? (cumDistToLps + residualNav) / cumCalled : 0,
    })
  }

  // Wind-down: remaining NAV realises at face value.
  cumDistToLps += residualNav
  netFlows.push({ year: years, amount: residualNav })

  const finalDpi = cumCalled > 0 ? cumDistToLps / cumCalled : 0
  const finalTvpi = finalDpi
  const netIrr = irr(netFlows)

  const notes: string[] = []
  if (i.studioAllocationPct > 0.30)
    notes.push("Studio allocation above 30% of the fund is a hard LP conversation — capital burning in opex instead of equity.")
  if (i.studioCommonPct > 0.40)
    notes.push("Common ownership above 40% at formation makes NewCos hard to finance — downstream VCs will demand founder-style resets.")
  if (impliedMultiple < 2)
    notes.push("Exit mix implies under 2× per NewCo — studio economics only work when the common stake rides a few outliers.")
  if (finalTvpi < 2)
    notes.push("Net TVPI under 2× — LPs price studio funds against the extra model risk; most target 2.5×+ net.")

  return {
    inputs: i,
    rows,
    totalCompanies,
    totalCalled: cumCalled,
    totalInvestedNewCos,
    totalStudioFunding,
    totalDistributions: cumDistToLps,
    totalCarry: carryPaid,
    studioGpIncome: totalCommonProceedsToGp + carryPaid,
    impliedNewCoMultiple: impliedMultiple,
    finalDpi,
    finalTvpi,
    netIrr,
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
export function buildExportWorkbook(state: VentureStudioInputs) {
  const r = compute(state)

  const headers = [
    "Year", "NewCos launched", "Fund → NewCos", "Fund → Studio",
    "Mgmt fee", "Studio opex", "Equity proceeds", "Common proceeds",
    "Distributions to LPs", "Studio cash", "DPI", "TVPI",
  ]
  const rows = r.rows.map((y) => [
    `Y${y.year}`,
    Math.round(y.companiesLaunched),
    Math.round(y.fundInvested),
    Math.round(y.studioFunding),
    Math.round(y.mgmtFee),
    Math.round(y.studioOpex),
    Math.round(y.exitProceedsEquity),
    Math.round(y.exitProceedsCommon),
    Math.round(y.distributionsToLps),
    Math.round(y.studioCash),
    +y.dpi.toFixed(2),
    +y.tvpi.toFixed(2),
  ])

  const summary: any[][] = [
    ["Fund size", fmtUsd(state.fundSizeUsd ?? 50_000_000)],
    ["Companies launched", r.totalCompanies],
    ["Check per NewCo", fmtUsd(state.checkPerNewCoUsd ?? 1_500_000)],
    ["Studio common at formation", `${((state.studioCommonPct ?? 0.30) * 100).toFixed(0)}%`],
    ["Studio allocation", `${((state.studioAllocationPct ?? 0.20) * 100).toFixed(0)}% of fund`],
    [""],
    ["Implied NewCo multiple (exit mix)", `${r.impliedNewCoMultiple.toFixed(2)}×`],
    ["Total called", fmtUsd(r.totalCalled)],
    ["Invested in NewCos", fmtUsd(r.totalInvestedNewCos)],
    ["Invested in Studio", fmtUsd(r.totalStudioFunding)],
    ["Distributions to LPs", fmtUsd(r.totalDistributions)],
    [""],
    ["Final DPI", `${r.finalDpi.toFixed(2)}×`],
    ["Final TVPI", `${r.finalTvpi.toFixed(2)}×`],
    ["Net IRR", `${(r.netIrr * 100).toFixed(1)}%`],
    ["GP income (carry + studio common)", fmtUsd(r.studioGpIncome)],
  ]

  return buildWorkbook([
    {
      name: "Summary",
      title: "Anker — Venture Studio Model",
      subtitle: "0/20/20 studio fund · common ownership · fund + studio twin entities",
      rows: summary,
      colWidths: [34, 22],
    },
    {
      name: "Annual model",
      headers,
      rows,
      colWidths: [7, 15, 14, 14, 12, 12, 15, 16, 19, 13, 8, 8],
      freeze: true,
    },
  ])
}
