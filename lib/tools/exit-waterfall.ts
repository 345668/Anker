/**
 * Exit waterfall — cap-table-aware payout simulation across share classes.
 *
 * Models the standard preferred-stock waterfall:
 *
 *   1. Liquidation preference     — each preferred class gets back its
 *      stack (usually 1× invested) before common sees a dollar.
 *   2. Participation              — non-participating preferred either
 *      takes the pref OR converts and takes pro-rata; participating
 *      takes the pref AND a pro-rata share of the remainder, optionally
 *      capped at a multiple of invested.
 *   3. Common pool                — anything left after prefs goes
 *      to common, ESOP, and converted preferred holders pro-rata.
 *
 * Also supports SAFEs / convertible notes — the easiest model is to
 * treat each as a preferred share class with priceRound = the round it
 * converts in.  For a quick pass we let the user supply `safeShares` +
 * `safeInvested` and we convert to a pro-rata pool at exit (no MFN /
 * discount logic; that's documented as a limitation).
 *
 * Output: per-share-class payout (cash + IRR-equivalent multiple) plus a
 * sensitivity grid across exit values so the user can read off "what
 * exit do common shareholders need before they see anything?"
 */

import { buildWorkbook, fmtUsd } from "./xlsx-export"

export type ParticipationKind = "non-participating" | "participating" | "capped-participating"

export interface ShareClass {
  id?: string
  name: string                       // "Series A", "Series B", "Common", "ESOP", ...
  /** What the holders paid in. 0 for common / ESOP. */
  invested: number
  shares: number                     // share count
  /** Ranked liquidation preference — 0 for common.  Higher = senior. */
  seniority: number                  // 0 = common, 1 = oldest preferred, ...
  /** Multiple of invested returned as preference. 1.0 is standard. */
  prefMultiple?: number
  participation?: ParticipationKind  // default 'non-participating'
  /** When `participation = 'capped-participating'`, total cap as a
   *  multiple of invested (typical 2× or 3×). */
  participationCap?: number
}

export interface ExitWaterfallInputs {
  exitValue: number                  // USD enterprise value at exit
  shareClasses: ShareClass[]
  /** Optional advisory transaction costs (bankers, legal). Reduce the
   *  pool before any waterfall math. */
  transactionCostsPct?: number       // e.g. 0.02 for 2%
}

export interface ClassPayout {
  name: string
  invested: number
  shares: number
  /** Cash to this class, all-in. */
  payout: number
  /** Multiple of invested; 0 for common / ESOP. */
  multiple: number
  /** Strategy actually applied — useful when participating preferred
   *  decides to convert instead. */
  strategy: "pref" | "convert" | "participate" | "common"
  /** Per-share value (USD/share). */
  perShare: number
  /** Share of total exit pool (0..1). */
  pctOfExit: number
}

export interface ExitWaterfallResult {
  exitValue: number
  netExitValue: number               // after transaction costs
  payouts: ClassPayout[]
  /** Sensitivity grid: rows = exit values, cols = per-class payout. */
  sensitivity: { exitValue: number; payouts: { name: string; payout: number; multiple: number }[] }[]
  /** Common breakeven — exit value at which common holders see >$0. */
  commonBreakevenExit: number | null
  notes: string[]
}

export function computeAtExit(input: ExitWaterfallInputs): {
  netExitValue: number
  payouts: ClassPayout[]
} {
  const txCosts = (input.transactionCostsPct ?? 0) * input.exitValue
  let net = Math.max(0, input.exitValue - txCosts)
  const totalShares = input.shareClasses.reduce((s, c) => s + c.shares, 0)
  const totalInvested = input.shareClasses.reduce((s, c) => s + c.invested, 0)

  // Sort by seniority desc — most senior pref paid first.
  const ordered = input.shareClasses.slice().sort((a, b) => b.seniority - a.seniority)

  // 1. Each preferred class: decide pref-or-convert if non-participating,
  //    pref-then-participate if participating.
  // We do this in two passes:
  //   pass 1: tentatively assume each non-participating takes its pref;
  //   pass 2: for each, compare to what they'd get if they converted to
  //   common pro-rata and took that path; pick the larger.
  const payouts: Record<string, ClassPayout> = {}
  let preferredPaid = 0

  // --- pass 1: pay liquidation prefs to senior → junior preferreds ---
  for (const c of ordered) {
    if (c.seniority === 0) continue
    const pref = c.invested * (c.prefMultiple ?? 1)
    const paid = Math.min(pref, Math.max(0, net - preferredPaid))
    payouts[c.name] = {
      name: c.name, invested: c.invested, shares: c.shares,
      payout: paid, multiple: c.invested > 0 ? paid / c.invested : 0,
      strategy: "pref", perShare: c.shares > 0 ? paid / c.shares : 0,
      pctOfExit: input.exitValue > 0 ? paid / input.exitValue : 0,
    }
    preferredPaid += paid
  }

  let remaining = Math.max(0, net - preferredPaid)

  // --- pass 2: distribute remainder ---
  // Identify which preferreds elect to participate / convert. For
  // participating: they keep their pref AND share in the remainder.
  // For non-participating: they choose max(pref, convert-and-share).
  // Capped-participating: they share in the remainder up to the cap, then
  // additional remainder flows only to common + ESOP + uncapped.
  //
  // To handle conversion correctly we split classes into "kept-pref"
  // and "converted" pools and recompute remainder distribution
  // pro-rata across the appropriate share counts.
  const kept: ShareClass[] = [] // taking pref only (non-participating)
  const converted: ShareClass[] = [] // converted to common
  const participating: { c: ShareClass; cap: number | null }[] = []
  const common: ShareClass[] = []

  for (const c of ordered) {
    if (c.seniority === 0) { common.push(c); continue }
    const part = c.participation ?? "non-participating"
    if (part === "non-participating") {
      // Tentatively keep pref; we'll re-evaluate below.
      kept.push(c)
    } else if (part === "participating") {
      participating.push({ c, cap: null })
    } else {
      const cap = (c.participationCap ?? 2) * c.invested
      participating.push({ c, cap })
    }
  }

  // Total shares that will share in the common pool:
  //   common + ESOP shares + participating preferred shares + converted shares
  const sharesParticipating = participating.reduce((s, p) => s + p.c.shares, 0)
  const sharesCommon = common.reduce((s, c) => s + c.shares, 0)
  const sharesConverted = converted.reduce((s, c) => s + c.shares, 0) // empty in pass 2 (we evaluate per class below)

  // For each non-participating, decide convert vs. keep:
  for (const c of kept) {
    const prefAmount = payouts[c.name].payout
    // Hypothetical: convert to common, take pro-rata of (remaining + prefAmount returned to pool)
    const sharePoolIfConvert = sharesCommon + sharesParticipating + c.shares
    const hypotheticalRemainder = remaining + prefAmount
    const proRata = sharePoolIfConvert > 0 ? (c.shares / sharePoolIfConvert) * hypotheticalRemainder : 0
    if (proRata > prefAmount) {
      // Convert: refund pref, add to common pool
      remaining += prefAmount
      preferredPaid -= prefAmount
      payouts[c.name] = { ...payouts[c.name], payout: 0, strategy: "convert", multiple: 0, perShare: 0, pctOfExit: 0 }
      converted.push(c)
    }
    // else: keep pref as-is
  }

  // Now distribute `remaining` across common + ESOP + participating + converted
  const sharePool =
    common.reduce((s, c) => s + c.shares, 0) +
    converted.reduce((s, c) => s + c.shares, 0) +
    participating.reduce((s, p) => s + p.c.shares, 0)

  if (sharePool > 0 && remaining > 0) {
    // Round 1: pro-rata distribution.
    let toDistribute = remaining
    let activeShares = sharePool
    // Honour caps for participating: any participating class hitting its cap stops drawing.
    const cappedClasses = new Set<string>()
    let safety = 6
    while (toDistribute > 0.01 && activeShares > 0 && safety-- > 0) {
      const perShareNow = toDistribute / activeShares
      let leftover = 0
      let nextActiveShares = activeShares

      // Common
      for (const c of common) {
        const draw = perShareNow * c.shares
        const prev = payouts[c.name]?.payout ?? 0
        payouts[c.name] = {
          name: c.name, invested: c.invested, shares: c.shares,
          payout: prev + draw, multiple: 0,
          strategy: "common", perShare: 0, pctOfExit: 0,
        }
      }
      // Converted (treat as common)
      for (const c of converted) {
        const draw = perShareNow * c.shares
        const prev = payouts[c.name]?.payout ?? 0
        payouts[c.name] = {
          name: c.name, invested: c.invested, shares: c.shares,
          payout: prev + draw, multiple: c.invested > 0 ? (prev + draw) / c.invested : 0,
          strategy: "convert", perShare: 0, pctOfExit: 0,
        }
      }
      // Participating
      for (const p of participating) {
        if (cappedClasses.has(p.c.name)) continue
        const drawAttempt = perShareNow * p.c.shares
        const prev = payouts[p.c.name]?.payout ?? 0
        const capLimit = p.cap == null ? Infinity : p.cap
        const room = Math.max(0, capLimit - prev)
        const draw = Math.min(drawAttempt, room)
        payouts[p.c.name] = {
          name: p.c.name, invested: p.c.invested, shares: p.c.shares,
          payout: prev + draw,
          multiple: p.c.invested > 0 ? (prev + draw) / p.c.invested : 0,
          strategy: "participate", perShare: 0, pctOfExit: 0,
        }
        if (draw < drawAttempt) {
          // Hit the cap → leftover redistributes
          leftover += drawAttempt - draw
          cappedClasses.add(p.c.name)
          nextActiveShares -= p.c.shares
        }
      }
      toDistribute = leftover
      activeShares = nextActiveShares
    }
  }

  // Final pass: per-share + pct-of-exit
  for (const c of input.shareClasses) {
    const p = payouts[c.name]
    if (!p) continue
    p.perShare = c.shares > 0 ? p.payout / c.shares : 0
    p.pctOfExit = input.exitValue > 0 ? p.payout / input.exitValue : 0
    if (p.strategy !== "pref" && c.invested > 0) {
      p.multiple = p.payout / c.invested
    }
  }

  return { netExitValue: net, payouts: input.shareClasses.map((c) => payouts[c.name]).filter(Boolean) }
}

export function compute(input: ExitWaterfallInputs): ExitWaterfallResult {
  const main = computeAtExit(input)

  // Sensitivity: 8 exit-value scenarios from 0.25× to 4× the headline.
  const factors = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
  const sensitivity = factors.map((f) => {
    const exitValue = Math.round(input.exitValue * f)
    const r = computeAtExit({ ...input, exitValue })
    return {
      exitValue,
      payouts: r.payouts.map((p) => ({ name: p.name, payout: p.payout, multiple: p.multiple })),
    }
  })

  // Common breakeven: smallest exit value at which any common class > 0.
  // Search the sensitivity grid first, then bisect for precision.
  const commonClass = input.shareClasses.find((c) => c.seniority === 0 && c.invested === 0)
  let commonBreakeven: number | null = null
  if (commonClass) {
    let lo = 0
    let hi = input.exitValue * 4
    for (let i = 0; i < 30 && hi - lo > 1000; i++) {
      const mid = (lo + hi) / 2
      const r = computeAtExit({ ...input, exitValue: mid })
      const got = r.payouts.find((p) => p.name === commonClass.name)?.payout ?? 0
      if (got > 0) hi = mid
      else lo = mid
    }
    commonBreakeven = Math.round(hi)
  }

  const notes: string[] = []
  if (input.shareClasses.some((c) => (c.participation ?? "non-participating") === "participating" && (c.participationCap == null)))
    notes.push("Uncapped participating preferred is founder-hostile — every dollar above the pref still flows partly to those investors.")
  if (input.transactionCostsPct == null || input.transactionCostsPct === 0)
    notes.push("No transaction-cost haircut applied — typical M&A bankers + legal take 1-3% of EV.")
  if (main.payouts.some((p) => p.strategy === "convert"))
    notes.push("At this exit, at least one preferred class converts to common (the pro-rata share beats the liquidation preference).")
  if (commonBreakeven != null && commonBreakeven > input.exitValue)
    notes.push(`Common holders see $0 at this exit. Breakeven for common is ~$${(commonBreakeven / 1e6).toFixed(1)}M.`)

  return {
    exitValue: input.exitValue,
    netExitValue: main.netExitValue,
    payouts: main.payouts,
    sensitivity,
    commonBreakevenExit: commonBreakeven,
    notes,
  }
}

// ─── xlsx export ──────────────────────────────────────────────────────
export function buildExportWorkbook(state: ExitWaterfallInputs) {
  const r = compute(state)
  const headlineHeaders = ["Class", "Invested", "Shares", "Strategy", "Payout", "Multiple", "Per-share", "% of exit"]
  const headlineRows = r.payouts.map((p) => [
    p.name, fmtUsd(p.invested), p.shares.toLocaleString(),
    p.strategy, fmtUsd(p.payout),
    p.multiple ? `${p.multiple.toFixed(2)}×` : "—",
    p.perShare ? `$${p.perShare.toFixed(2)}` : "—",
    `${(p.pctOfExit * 100).toFixed(1)}%`,
  ])

  const sensHeaders = ["Exit value", ...r.payouts.map((p) => p.name)]
  const sensRows = r.sensitivity.map((s) => [
    fmtUsd(s.exitValue),
    ...s.payouts.map((p) => fmtUsd(p.payout)),
  ])

  const inputRows = state.shareClasses.map((c) => [
    c.name, fmtUsd(c.invested), c.shares.toLocaleString(),
    c.seniority,
    `${(c.prefMultiple ?? 1).toFixed(2)}×`,
    c.participation ?? "non-participating",
    c.participationCap != null ? `${c.participationCap.toFixed(2)}× cap` : "—",
  ])
  const inputHeaders = ["Class", "Invested", "Shares", "Seniority", "Pref ×", "Participation", "Cap"]

  return buildWorkbook([
    {
      name: "Waterfall",
      title: `Anker — Exit Waterfall (${fmtUsd(state.exitValue)} exit)`,
      subtitle: r.commonBreakevenExit != null
        ? `Common breakeven: ${fmtUsd(r.commonBreakevenExit)} EV  ·  Net to distribute: ${fmtUsd(r.netExitValue)}`
        : `Net to distribute: ${fmtUsd(r.netExitValue)}`,
      headers: headlineHeaders,
      rows: headlineRows,
      colWidths: [20, 18, 14, 16, 16, 10, 12, 10],
      freeze: true,
    },
    {
      name: "Sensitivity",
      title: "Payout sensitivity by exit value",
      headers: sensHeaders,
      rows: sensRows,
      colWidths: [16, ...r.payouts.map(() => 16)],
    },
    {
      name: "Cap table input",
      headers: inputHeaders,
      rows: inputRows,
      colWidths: [20, 16, 14, 10, 8, 22, 16],
    },
  ])
}
