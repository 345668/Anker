/**
 * Venture Valuation (Anker original).
 *
 * Three independent methodologies side-by-side:
 *   1. DCF — discounted free-cash-flow over a forecast horizon + terminal value
 *   2. Comps — current revenue × peer revenue multiple
 *   3. Venture Method — exit value × peer multiple, discounted by target IRR
 */

import { buildWorkbook, fmtUsd, fmtPct, type SheetSpec } from "./xlsx-export"

export interface VentureValuationInputs {
  // Common
  currentRevenue: number
  // DCF
  dcfYears: number // 5
  growthRateYears1to3: number // 0..N
  growthRateYears4to5: number
  fcfMargin: number // free cash flow as % of revenue
  discountRate: number // WACC, e.g. 0.20
  terminalGrowthRate: number // e.g. 0.03
  // Comps
  peerRevMultiple: number // e.g. 8x
  // Venture Method
  exitYearRevenue: number // expected revenue at exit
  exitMultiple: number
  targetIrr: number // e.g. 0.30 (30%)
  yearsToExit: number // e.g. 5
  // Allocation
  netDebt: number // subtracted from EV to get equity value
  fullyDilutedShares: number // for per-share valuation
}

export interface DcfYear {
  year: number
  revenue: number
  fcf: number
  pvFactor: number
  pv: number
}

export interface VentureValuationResult {
  dcf: {
    years: DcfYear[]
    terminalValue: number
    pvOfTerminal: number
    enterpriseValue: number
    equityValue: number
    perShare: number
  }
  comps: {
    enterpriseValue: number
    equityValue: number
    perShare: number
  }
  venture: {
    exitEnterpriseValue: number
    presentEnterpriseValue: number
    equityValue: number
    perShare: number
  }
  blended: {
    /** Simple unweighted average of the three equity values */
    avgEquityValue: number
    /** Tightest range across methods */
    low: number
    high: number
  }
}

export function compute(inp: VentureValuationInputs): VentureValuationResult {
  // ─── DCF ───────────────────────────────────────────────────────────────
  let rev = inp.currentRevenue
  const years: DcfYear[] = []
  let pvSum = 0
  for (let y = 1; y <= inp.dcfYears; y++) {
    const g = y <= 3 ? inp.growthRateYears1to3 : inp.growthRateYears4to5
    rev = rev * (1 + g)
    const fcf = rev * inp.fcfMargin
    const pvFactor = 1 / Math.pow(1 + inp.discountRate, y)
    const pv = fcf * pvFactor
    pvSum += pv
    years.push({ year: y, revenue: rev, fcf, pvFactor, pv })
  }
  const lastFcf = years[years.length - 1].fcf
  const terminalValue =
    inp.discountRate > inp.terminalGrowthRate
      ? (lastFcf * (1 + inp.terminalGrowthRate)) / (inp.discountRate - inp.terminalGrowthRate)
      : 0
  const pvOfTerminal = terminalValue / Math.pow(1 + inp.discountRate, inp.dcfYears)
  const dcfEv = pvSum + pvOfTerminal
  const dcfEquity = dcfEv - inp.netDebt
  const dcfPerShare = inp.fullyDilutedShares > 0 ? dcfEquity / inp.fullyDilutedShares : 0

  // ─── Comps ─────────────────────────────────────────────────────────────
  const compsEv = inp.currentRevenue * inp.peerRevMultiple
  const compsEquity = compsEv - inp.netDebt
  const compsPerShare = inp.fullyDilutedShares > 0 ? compsEquity / inp.fullyDilutedShares : 0

  // ─── Venture Method ────────────────────────────────────────────────────
  const exitEv = inp.exitYearRevenue * inp.exitMultiple
  const presentEv = exitEv / Math.pow(1 + inp.targetIrr, inp.yearsToExit)
  const ventureEquity = presentEv - inp.netDebt
  const venturePerShare = inp.fullyDilutedShares > 0 ? ventureEquity / inp.fullyDilutedShares : 0

  const equities = [dcfEquity, compsEquity, ventureEquity]
  const avgEquity = equities.reduce((a, b) => a + b, 0) / 3

  return {
    dcf: { years, terminalValue, pvOfTerminal, enterpriseValue: dcfEv, equityValue: dcfEquity, perShare: dcfPerShare },
    comps: { enterpriseValue: compsEv, equityValue: compsEquity, perShare: compsPerShare },
    venture: { exitEnterpriseValue: exitEv, presentEnterpriseValue: presentEv, equityValue: ventureEquity, perShare: venturePerShare },
    blended: {
      avgEquityValue: avgEquity,
      low: Math.min(...equities),
      high: Math.max(...equities),
    },
  }
}

export function buildExportWorkbook(inp: VentureValuationInputs) {
  const r = compute(inp)

  const inputsSheet: SheetSpec = {
    name: "Inputs",
    title: "Venture Valuation — Inputs",
    subtitle: `Built natively in Anker · ${new Date().toISOString().slice(0, 10)}`,
    headers: ["Field", "Value"],
    rows: [
      ["Current annual revenue", fmtUsd(inp.currentRevenue)],
      ["DCF horizon (years)", inp.dcfYears],
      ["Revenue growth — years 1-3", fmtPct(inp.growthRateYears1to3)],
      ["Revenue growth — years 4-5", fmtPct(inp.growthRateYears4to5)],
      ["FCF margin", fmtPct(inp.fcfMargin)],
      ["Discount rate (WACC)", fmtPct(inp.discountRate)],
      ["Terminal growth rate", fmtPct(inp.terminalGrowthRate)],
      ["—", "—"],
      ["Peer revenue multiple", `${inp.peerRevMultiple.toFixed(1)}×`],
      ["—", "—"],
      ["Exit-year revenue", fmtUsd(inp.exitYearRevenue)],
      ["Exit revenue multiple", `${inp.exitMultiple.toFixed(1)}×`],
      ["Target IRR (venture method)", fmtPct(inp.targetIrr)],
      ["Years to exit", inp.yearsToExit],
      ["—", "—"],
      ["Net debt", fmtUsd(inp.netDebt)],
      ["Fully-diluted shares outstanding", inp.fullyDilutedShares.toLocaleString()],
    ],
    colWidths: [38, 22],
  }

  const dcfSheet: SheetSpec = {
    name: "DCF",
    title: "DCF — discounted FCF + terminal value",
    headers: ["Year", "Revenue", "FCF", "PV factor", "PV of FCF"],
    rows: [
      ...r.dcf.years.map((y) => [y.year, fmtUsd(y.revenue), fmtUsd(y.fcf), y.pvFactor.toFixed(4), fmtUsd(y.pv)]),
      ["Terminal value (Gordon growth)", "", fmtUsd(r.dcf.terminalValue), "", fmtUsd(r.dcf.pvOfTerminal)],
      ["Enterprise value", "", "", "", fmtUsd(r.dcf.enterpriseValue)],
      ["Less: net debt", "", "", "", fmtUsd(inp.netDebt)],
      ["Equity value", "", "", "", fmtUsd(r.dcf.equityValue)],
      ["Per share", "", "", "", fmtUsd(r.dcf.perShare, 2)],
    ],
    colWidths: [32, 18, 18, 12, 18],
  }

  const compsSheet: SheetSpec = {
    name: "Comps",
    title: "Comparables — revenue multiple",
    headers: ["Metric", "Value"],
    rows: [
      ["Current revenue", fmtUsd(inp.currentRevenue)],
      ["Peer revenue multiple", `${inp.peerRevMultiple.toFixed(1)}×`],
      ["Enterprise value", fmtUsd(r.comps.enterpriseValue)],
      ["Less: net debt", fmtUsd(inp.netDebt)],
      ["Equity value", fmtUsd(r.comps.equityValue)],
      ["Per share", fmtUsd(r.comps.perShare, 2)],
    ],
    colWidths: [38, 22],
  }

  const ventureSheet: SheetSpec = {
    name: "Venture Method",
    title: "Venture Method — exit / target IRR",
    headers: ["Metric", "Value"],
    rows: [
      ["Exit-year revenue", fmtUsd(inp.exitYearRevenue)],
      ["Exit multiple", `${inp.exitMultiple.toFixed(1)}×`],
      ["Exit enterprise value", fmtUsd(r.venture.exitEnterpriseValue)],
      ["Target IRR", fmtPct(inp.targetIrr)],
      ["Years to exit", inp.yearsToExit],
      ["Present-value enterprise value", fmtUsd(r.venture.presentEnterpriseValue)],
      ["Less: net debt", fmtUsd(inp.netDebt)],
      ["Equity value", fmtUsd(r.venture.equityValue)],
      ["Per share", fmtUsd(r.venture.perShare, 2)],
    ],
    colWidths: [38, 22],
  }

  const summarySheet: SheetSpec = {
    name: "Summary",
    title: "Valuation summary — all three methods",
    headers: ["Method", "Equity value", "Per share"],
    rows: [
      ["DCF", fmtUsd(r.dcf.equityValue), fmtUsd(r.dcf.perShare, 2)],
      ["Comparables", fmtUsd(r.comps.equityValue), fmtUsd(r.comps.perShare, 2)],
      ["Venture method", fmtUsd(r.venture.equityValue), fmtUsd(r.venture.perShare, 2)],
      ["Range — low", fmtUsd(r.blended.low), ""],
      ["Range — average", fmtUsd(r.blended.avgEquityValue), ""],
      ["Range — high", fmtUsd(r.blended.high), ""],
    ],
    colWidths: [22, 22, 18],
  }

  return buildWorkbook([inputsSheet, summarySheet, dcfSheet, compsSheet, ventureSheet])
}
