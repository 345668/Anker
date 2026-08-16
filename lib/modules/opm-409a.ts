/**
 * 409A valuation via the Option Pricing Method (OPM) backsolve — pure, no
 * server deps (runs live in the client).
 *
 * Two-class model (common + aggregate non-participating preferred), which
 * covers the typical early-stage cap table. Equity is modelled as a series of
 * call options on total equity value at the economic "breakpoints":
 *   [0, LP]      → 100% preferred (liquidation preference)
 *   [LP, CP]     → 100% common (preferred capped at its pref)
 *   [CP, ∞)      → pro-rata (preferred converts), CP = LP / preferred%
 * The tranche between two breakpoints is worth C(low) − C(high), where C(K) is a
 * Black-Scholes call on equity value struck at K.
 *
 * Backsolve: find the total equity value W such that the OPM value of preferred
 * equals (preferred shares × the most recent preferred price). Then common per
 * share = common value / common shares, less a DLOM → the 409A fair market value.
 */

export interface OpmInputs {
  commonShares: number
  preferredShares: number
  liquidationPref: number   // total $ liquidation preference of preferred
  recentPrice: number       // price per preferred share of the calibrating round
  volatility: number        // e.g. 0.60
  riskFreeRate: number      // e.g. 0.04
  yearsToLiquidity: number  // e.g. 4
  dlom: number              // discount for lack of marketability, e.g. 0.25
}

export interface OpmResult {
  equityValue: number
  preferredValue: number
  commonValue: number
  commonPerShareMarketable: number
  commonFmv: number         // after DLOM — the 409A value
  breakpoints: { lp: number; conversion: number }
  tranches: { label: string; from: number; to: number | null; toCommon: number; toPreferred: number; value: number }[]
  impliedPostMoney: number
}

// Abramowitz-Stegun normal CDF approximation.
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x))
  const d = 0.3989422804014327 * Math.exp(-x * x / 2)
  let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))))
  if (x > 0) p = 1 - p
  return p
}

/** Black-Scholes European call on equity value S struck at K. C(0) = S. */
export function bsCall(S: number, K: number, r: number, sigma: number, t: number): number {
  if (S <= 0) return 0
  if (K <= 0) return S
  if (t <= 0 || sigma <= 0) return Math.max(0, S - K) // intrinsic
  const sqrtT = Math.sqrt(t)
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * t) / (sigma * sqrtT)
  const d2 = d1 - sigma * sqrtT
  return S * normCdf(d1) - K * Math.exp(-r * t) * normCdf(d2)
}

function pcts(i: OpmInputs) {
  const total = i.commonShares + i.preferredShares
  const prefPct = total > 0 ? i.preferredShares / total : 0
  return { total, prefPct, commonPct: 1 - prefPct }
}

/** Allocate a given equity value W to common + preferred via the breakpoints. */
export function allocate(W: number, i: OpmInputs) {
  const { prefPct, commonPct } = pcts(i)
  const LP = i.liquidationPref
  const CP = prefPct > 0 ? LP / prefPct : Infinity
  const r = i.riskFreeRate, s = i.volatility, t = i.yearsToLiquidity
  const C0 = bsCall(W, 0, r, s, t)
  const Clp = bsCall(W, LP, r, s, t)
  const Ccp = Number.isFinite(CP) ? bsCall(W, CP, r, s, t) : 0

  const t1 = C0 - Clp            // [0, LP] → preferred
  const t2 = Clp - Ccp           // [LP, CP] → common
  const t3 = Ccp                 // [CP, ∞) → pro-rata

  const preferredValue = t1 + prefPct * t3
  const commonValue = t2 + commonPct * t3
  return { LP, CP, preferredValue, commonValue, t1, t2, t3, prefPct, commonPct }
}

/** Backsolve the equity value so preferred's OPM value = pref shares × recent price. */
export function backsolveEquityValue(i: OpmInputs): number {
  const target = i.preferredShares * i.recentPrice
  if (target <= 0) return 0
  // Preferred value is increasing in W → bisect.
  let lo = 0
  let hi = Math.max(target * 4, i.liquidationPref * 4, 1)
  // Grow hi until preferred value exceeds target.
  for (let k = 0; k < 60 && allocate(hi, i).preferredValue < target; k++) hi *= 2
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2
    const pv = allocate(mid, i).preferredValue
    if (Math.abs(pv - target) < target * 1e-7) return mid
    if (pv < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

const round2 = (v: number) => Math.round(v * 100) / 100
const round4 = (v: number) => Math.round(v * 10000) / 10000

export function compute409a(i: OpmInputs): OpmResult {
  const W = backsolveEquityValue(i)
  const a = allocate(W, i)
  const commonPerShareMarketable = i.commonShares > 0 ? a.commonValue / i.commonShares : 0
  const commonFmv = commonPerShareMarketable * (1 - i.dlom)
  const totalShares = i.commonShares + i.preferredShares
  return {
    equityValue: round2(W),
    preferredValue: round2(a.preferredValue),
    commonValue: round2(a.commonValue),
    commonPerShareMarketable: round4(commonPerShareMarketable),
    commonFmv: round4(commonFmv),
    breakpoints: { lp: round2(a.LP), conversion: Number.isFinite(a.CP) ? round2(a.CP) : 0 },
    tranches: [
      { label: "Liquidation preference", from: 0, to: round2(a.LP), toCommon: 0, toPreferred: 100, value: round2(a.t1) },
      { label: "Common participation", from: round2(a.LP), to: Number.isFinite(a.CP) ? round2(a.CP) : null, toCommon: 100, toPreferred: 0, value: round2(a.t2) },
      { label: "As-converted (pro-rata)", from: Number.isFinite(a.CP) ? round2(a.CP) : 0, to: null, toCommon: round2(a.commonPct * 100), toPreferred: round2(a.prefPct * 100), value: round2(a.t3) },
    ],
    impliedPostMoney: round2(totalShares * i.recentPrice),
  }
}
