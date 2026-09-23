/**
 * Can this LP write the cheque this fund needs? (docs/architecture/19 §3)
 *
 * The old model scored AUM absolutely — bigger was better, and "anchor" meant
 * "holds $500M or more", with the fund's own raise nowhere in the calculation.
 * Two thirds of every result carried the anchor tag, and a $27B endowment
 * ranked top for a $40M fund whose minimum cheque it could not sensibly write.
 *
 * What matters is the *ticket*: AUM × the share of it that type of allocator
 * puts into one venture fund, measured against the band this fund can take.
 *
 * Pure — no database, no clock.
 */
import type { LpTypeKey } from "./scoring"

/** Share of AUM a type of allocator typically commits to a single fund (doc 19 §3). */
export const ALLOCATION_RATE: Record<LpTypeKey | "unknown", number> = {
  fund_of_funds: 0.02,
  family_office: 0.015,
  sovereign_wealth: 0.0025,
  endowment: 0.005,
  pension: 0.0025,
  institutional_other: 0.005,
  asset_wealth_manager: 0.005,
  insurance: 0.005,
  bank: 0.005,
  hnw_angel: 0.02,
  lp_signal_bio: 0.01,
  unknown: 0.01,
}

export interface RaiseBand {
  /** Smallest cheque the fund will take. */
  floor: number
  /** Largest cheque it should take from one LP — 30% of target (doc 19 §3). */
  ceiling: number
  /** At or above this, one commitment anchors the fund. */
  anchorFloor: number
}

/**
 * The band a fund can accept, from its own terms. Without a stated minimum,
 * 2.5% of target is the working assumption.
 */
export function raiseBand(targetRaise: number | null | undefined, minimumCommitment?: number | null): RaiseBand | null {
  const target = Number(targetRaise)
  if (!Number.isFinite(target) || target <= 0) return null
  const stated = Number(minimumCommitment)
  const floor = Number.isFinite(stated) && stated > 0 ? stated : target * 0.025
  return { floor, ceiling: target * 0.3, anchorFloor: target * 0.1 }
}

export interface Capacity {
  /** [0,1] — how well the expected cheque fits the band. */
  value: number
  /** Could one commitment from them anchor this fund? */
  isAnchor: boolean
  expectedTicket: number | null
  /** True when AUM was read, false when the rate was applied to nothing. */
  known: boolean
  /** Why it scored what it scored, in the fund's own terms. */
  reason: string
  /** Set when the mismatch is bad enough to hold the score back (doc 19 §6). */
  gate: "capacity_mismatch" | null
}

const money = (n: number) =>
  n >= 1e9 ? `$${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `$${Math.round(n / 1e6)}M` : `$${Math.round(n / 1e3)}K`

/** Unknown is unknown: never a top score, never a zero, and always labelled. */
const UNKNOWN: Capacity = {
  value: 0.5, isAnchor: false, expectedTicket: null, known: false,
  reason: "Capacity unknown — no AUM on record", gate: null,
}

/**
 * Score an LP's capacity for one fund.
 *
 * `aumUsd` is the allocator's assets; `type` decides what share of them one
 * commitment represents. A fund with no stated target cannot judge capacity at
 * all, and says so rather than guessing.
 */
export function scoreCapacity(aumUsd: number | null | undefined, type: LpTypeKey | null, band: RaiseBand | null): Capacity {
  if (!band) return { ...UNKNOWN, reason: "Capacity not scored — the fund states no target raise" }
  const aum = Number(aumUsd)
  if (!Number.isFinite(aum) || aum <= 0) return UNKNOWN

  const rate = ALLOCATION_RATE[type ?? "unknown"] ?? ALLOCATION_RATE.unknown
  const ticket = aum * rate
  const inBand = ticket >= band.floor && ticket <= band.ceiling
  const isAnchor = ticket >= band.anchorFloor && ticket <= band.ceiling
  const base = {
    expectedTicket: ticket,
    known: true,
    isAnchor,
  }

  if (inBand) {
    return {
      ...base, value: 1,
      reason: `${money(aum)} AUM → a ${money(ticket)} cheque${isAnchor ? ", enough to anchor this fund" : ""}`,
      gate: null,
    }
  }

  if (ticket > band.ceiling) {
    const over = ticket / band.ceiling
    // Too big is a real problem: their smallest sensible cheque is larger than
    // the fund should take from one LP, so the fund is below their floor.
    if (over > 4) {
      return {
        ...base, value: 0.15,
        reason: `${money(aum)} AUM → a typical ${money(ticket)} cheque, ${Math.round(over)}× more than this fund should take from one LP`,
        gate: "capacity_mismatch",
      }
    }
    return {
      ...base, value: over > 2 ? 0.3 : 0.6,
      reason: `${money(aum)} AUM → a ${money(ticket)} cheque; they would be writing small for this fund`,
      gate: null,
    }
  }

  // Below the floor.
  if (ticket < band.floor / 2) {
    return {
      ...base, value: 0.1,
      reason: `${money(aum)} AUM → about ${money(ticket)}, below the ${money(band.floor)} minimum`,
      gate: "capacity_mismatch",
    }
  }
  return {
    ...base, value: 0.5,
    reason: `${money(aum)} AUM → about ${money(ticket)}, close to the ${money(band.floor)} minimum`,
    gate: null,
  }
}
