/**
 * VC Performance Tracker (Anker original).
 *
 * Per-investment MOIC / DPI / TVPI / IRR + fund-level rollup.
 *
 * MOIC  = (distributed + remaining value) / invested
 * DPI   = distributed / invested
 * TVPI  = (distributed + remaining value) / invested  (same as MOIC at the
 *         fund level once you exclude unfunded commitments)
 * IRR   = annualised dollar-weighted return
 */

import { buildWorkbook, fmtPct, fmtUsd, type SheetSpec } from "./xlsx-export"

export interface VcInvestment {
  id?: string
  fund: string // "Fund I" / "Fund II"
  company: string
  sector?: string
  vintage: number // year of first investment
  invested: number // total $ deployed (basis)
  distributed: number // $ realised back
  unrealizedNav: number // current carrying value
  /** Optional cash flows for IRR: signed (negative = invested, positive = distributions) */
  cashflows?: { date: string; amount: number }[]
}

export interface VcInvestmentResult extends VcInvestment {
  moic: number
  dpi: number
  tvpi: number
  irr: number | null // annualised; null if no cashflows
}

export interface FundRollup {
  fund: string
  investments: number
  invested: number
  distributed: number
  nav: number
  moic: number
  dpi: number
  tvpi: number
  irr: number | null
}

export function computeInvestment(inv: VcInvestment): VcInvestmentResult {
  const totalValue = inv.distributed + inv.unrealizedNav
  const moic = inv.invested > 0 ? totalValue / inv.invested : 0
  const dpi = inv.invested > 0 ? inv.distributed / inv.invested : 0
  const tvpi = moic
  const irr = inv.cashflows ? xirr(inv.cashflows) : null
  return { ...inv, moic, dpi, tvpi, irr }
}

export function rollupFund(investments: VcInvestmentResult[]): FundRollup[] {
  const groups = new Map<string, VcInvestmentResult[]>()
  for (const i of investments) {
    if (!groups.has(i.fund)) groups.set(i.fund, [])
    groups.get(i.fund)!.push(i)
  }
  const out: FundRollup[] = []
  for (const [fund, list] of groups.entries()) {
    const invested = list.reduce((a, b) => a + b.invested, 0)
    const distributed = list.reduce((a, b) => a + b.distributed, 0)
    const nav = list.reduce((a, b) => a + b.unrealizedNav, 0)
    const total = distributed + nav
    // Aggregate IRR: combine all cashflows
    const allCfs = list.flatMap((i) => i.cashflows ?? [])
    const irr = allCfs.length ? xirr(allCfs) : null
    out.push({
      fund,
      investments: list.length,
      invested,
      distributed,
      nav,
      moic: invested > 0 ? total / invested : 0,
      dpi: invested > 0 ? distributed / invested : 0,
      tvpi: invested > 0 ? total / invested : 0,
      irr,
    })
  }
  return out.sort((a, b) => a.fund.localeCompare(b.fund))
}

// ─── XIRR (dollar-weighted IRR) — Newton's method ──────────────────────────
function xirr(cfs: { date: string; amount: number }[]): number | null {
  if (cfs.length < 2) return null
  const sorted = [...cfs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const t0 = new Date(sorted[0].date).getTime()
  const ts = sorted.map((c) => (new Date(c.date).getTime() - t0) / (1000 * 60 * 60 * 24 * 365))
  const amounts = sorted.map((c) => c.amount)
  // Guard: must contain at least one negative and one positive
  if (!amounts.some((a) => a < 0) || !amounts.some((a) => a > 0)) return null

  const npv = (rate: number) => amounts.reduce((s, a, i) => s + a / Math.pow(1 + rate, ts[i]), 0)
  const dnpv = (rate: number) => amounts.reduce((s, a, i) => s - (ts[i] * a) / Math.pow(1 + rate, ts[i] + 1), 0)

  let rate = 0.1
  for (let iter = 0; iter < 100; iter++) {
    const v = npv(rate)
    const d = dnpv(rate)
    if (Math.abs(d) < 1e-10) break
    const next = rate - v / d
    if (Math.abs(next - rate) < 1e-7) return next
    rate = next
    if (rate < -0.99) rate = -0.99
  }
  return rate
}

export function buildExportWorkbook(investments: VcInvestment[]) {
  const computed = investments.map(computeInvestment)
  const rollups = rollupFund(computed)

  const summarySheet: SheetSpec = {
    name: "Summary",
    title: "VC Performance — Fund Rollup",
    subtitle: `Built natively in Anker · ${investments.length} investments across ${rollups.length} funds · ${new Date().toISOString().slice(0, 10)}`,
    headers: ["Fund", "Investments", "Invested", "Distributed", "NAV", "MOIC", "DPI", "TVPI", "IRR"],
    rows: rollups.map((r) => [
      r.fund,
      r.investments,
      fmtUsd(r.invested),
      fmtUsd(r.distributed),
      fmtUsd(r.nav),
      r.moic.toFixed(2) + "×",
      r.dpi.toFixed(2) + "×",
      r.tvpi.toFixed(2) + "×",
      r.irr != null ? fmtPct(r.irr) : "—",
    ]),
    colWidths: [12, 14, 16, 16, 16, 9, 9, 9, 10],
  }

  const detailSheet: SheetSpec = {
    name: "Investments",
    title: "All investments",
    freeze: true,
    headers: ["Fund", "Company", "Sector", "Vintage", "Invested", "Distributed", "NAV", "Total value", "MOIC", "DPI", "TVPI", "IRR"],
    rows: computed.map((i) => [
      i.fund,
      i.company,
      i.sector ?? "",
      i.vintage,
      fmtUsd(i.invested),
      fmtUsd(i.distributed),
      fmtUsd(i.unrealizedNav),
      fmtUsd(i.distributed + i.unrealizedNav),
      i.moic.toFixed(2) + "×",
      i.dpi.toFixed(2) + "×",
      i.tvpi.toFixed(2) + "×",
      i.irr != null ? fmtPct(i.irr) : "—",
    ]),
    colWidths: [12, 28, 16, 9, 16, 16, 16, 16, 9, 9, 9, 10],
  }

  return buildWorkbook([summarySheet, detailSheet])
}
