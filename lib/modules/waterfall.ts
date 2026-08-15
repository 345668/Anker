/**
 * SPV distribution waterfall — pure math, no server deps (safe to import in
 * client components for the interactive modeler).
 *
 * Model: single-tier carry with an optional preferred return (hurdle), no GP
 * catch-up. Given the capital contributed and the exit proceeds:
 *   1. Return of capital to LPs (capped at proceeds — a loss returns less).
 *   2. Profit = proceeds − contributed.
 *   3. LPs keep profit up to the hurdle (contributed × hurdle%) in full.
 *   4. Above the hurdle, the GP takes carry%; LPs take the rest.
 * LP and GP distributions always sum to proceeds.
 */

export interface WaterfallResult {
  contributed: number
  proceeds: number
  profit: number
  returnOfCapital: number
  lpPreferred: number
  lpProfitShare: number
  gpCarry: number
  lpTotal: number
  gpTotal: number
  grossMoic: number
  lpMoic: number
}

export function computeWaterfall(contributed: number, proceeds: number, carryPct: number, hurdlePct: number): WaterfallResult {
  const C = Math.max(0, contributed)
  const P = Math.max(0, proceeds)
  const returnOfCapital = Math.min(P, C)
  const profit = Math.max(0, P - C)
  const hurdleAmt = C * (hurdlePct / 100)
  const lpPreferred = Math.min(profit, hurdleAmt)
  const profitAboveHurdle = Math.max(0, profit - hurdleAmt)
  const gpCarry = profitAboveHurdle * (carryPct / 100)
  const lpProfitShare = profitAboveHurdle - gpCarry
  const lpTotal = returnOfCapital + lpPreferred + lpProfitShare
  const gpTotal = gpCarry
  return {
    contributed: C,
    proceeds: P,
    profit,
    returnOfCapital,
    lpPreferred,
    lpProfitShare,
    gpCarry,
    lpTotal,
    gpTotal,
    grossMoic: C > 0 ? P / C : 0,
    lpMoic: C > 0 ? lpTotal / C : 0,
  }
}

export interface CapTableRow {
  investor: string
  contributed: number
  /** Fraction of the LP pool (0–1). */
  ownership: number
}

/** Per-investor distribution at a given exit: pro-rata share of the LP total. */
export function distributeToInvestors(rows: CapTableRow[], wf: WaterfallResult): {
  investor: string; contributed: number; ownership: number; distribution: number; gain: number; moic: number
}[] {
  return rows.map((r) => {
    const distribution = r.ownership * wf.lpTotal
    return {
      investor: r.investor,
      contributed: r.contributed,
      ownership: r.ownership,
      distribution,
      gain: distribution - r.contributed,
      moic: r.contributed > 0 ? distribution / r.contributed : 0,
    }
  })
}
