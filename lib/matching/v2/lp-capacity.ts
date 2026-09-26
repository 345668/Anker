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
  /** The fund's stated target. Some LP types will not look at a fund this small. */
  target: number
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
  return { floor, ceiling: target * 0.3, anchorFloor: target * 0.1, target }
}

/**
 * The smallest fund each institutional type will realistically look at.
 *
 * Cheque arithmetic is not the only constraint on whether an LP can back a fund.
 * An endowment, pension or sovereign fund has a *manager* minimum as well as a
 * cheque minimum: a committee, a diligence process and a policy floor on fund
 * size, below which a manager is un-investable however well the numbers work.
 *
 * Without this, a $300M university endowment allocating at 0.5% produces a $1.5M
 * cheque, which lands exactly on a $5M fund's ceiling and therefore scored a
 * PERFECT capacity fit — the measured result was the University of North Dakota
 * as the single Champion for a $5M first-time consumer fund. The maths was right
 * and the premise was wrong.
 *
 * Family offices, HNW angels and fund-of-funds are absent on purpose: backing
 * small and first-time managers is precisely what many of them do.
 */
const INSTITUTIONAL_FUND_FLOOR: Partial<Record<LpTypeKey, number>> = {
  sovereign_wealth: 100_000_000,
  pension: 100_000_000,
  insurance: 100_000_000,
  bank: 50_000_000,
  endowment: 25_000_000,
  institutional_other: 25_000_000,
  asset_wealth_manager: 10_000_000,
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
 * A conservative floor on what these allocator types are worth, for the case
 * where no AUM is on record.
 *
 * Why this exists: the mismatch gate in `scoreCapacity` only fires on a *known*
 * AUM, so an endowment with no AUM field scored a neutral 0.5 and could not be
 * told apart from a family office with no AUM field. Measured on a $5M North
 * American consumer fund, that put four university endowments — three of them
 * overseas — in the top five, one of them a Champion.
 *
 * These are deliberately low-end figures for each category, because the purpose
 * is only to answer "is this structurally far too large to write into a small
 * fund", and a floor that understates still answers it. Types that are *not*
 * structurally large (family office, HNW angel, fund-of-funds) are absent on
 * purpose: their size genuinely varies, so unknown stays unknown for them.
 */
const TYPICAL_AUM_FLOOR: Partial<Record<LpTypeKey, number>> = {
  sovereign_wealth: 20_000_000_000,
  pension: 2_000_000_000,
  endowment: 500_000_000,
  insurance: 1_000_000_000,
  bank: 1_000_000_000,
  institutional_other: 250_000_000,
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

  // Does this kind of allocator look at a fund this small at all? Asked before
  // the cheque arithmetic, because no cheque size rescues a manager minimum.
  const fundFloor = type ? INSTITUTIONAL_FUND_FLOOR[type] : undefined
  if (fundFloor && band.target < fundFloor) {
    return {
      value: 0.1,
      isAnchor: false,
      expectedTicket: null,
      known: Number.isFinite(Number(aumUsd)) && Number(aumUsd) > 0,
      reason: `A ${type!.replace(/_/g, " ")} does not typically back a fund of ${money(band.target)} — below the ${money(fundFloor)} manager minimum for this kind of allocator`,
      gate: "capacity_mismatch",
    }
  }

  const rate = ALLOCATION_RATE[type ?? "unknown"] ?? ALLOCATION_RATE.unknown

  let aum = Number(aumUsd)
  let inferred = false
  if (!Number.isFinite(aum) || aum <= 0) {
    // No AUM on record. For a type that is structurally large, fall back to the
    // category floor rather than scoring it neutral — otherwise "we have no AUM
    // for this endowment" reads as "this endowment might be the right size",
    // which is how a $500M+ allocator ends up at the top of a $5M fund's list.
    const floor = type ? TYPICAL_AUM_FLOOR[type] : undefined
    if (!floor) return UNKNOWN
    aum = floor
    inferred = true
  }

  const ticket = aum * rate

  // An inferred size can demote but must never promote: the evidence for it is a
  // category, not this allocator. So it only speaks when it says "too large".
  if (inferred) {
    if (ticket <= band.ceiling) return UNKNOWN
    const over = ticket / band.ceiling
    // A lower gate threshold than the known-AUM path above (4×), on purpose.
    // TYPICAL_AUM_FLOOR is a deliberate under-estimate, so the ticket computed
    // from it is the *smallest* plausible cheque for the category — exceeding
    // the fund's ceiling even modestly means every realistic version of this
    // allocator is too large. A real university endowment is frequently 2-4×
    // the floor used here.
    return {
      expectedTicket: null,
      known: false,
      isAnchor: false,
      value: over > 4 ? 0.15 : 0.3,
      reason: `No AUM on record; a typical ${type?.replace(/_/g, " ")} allocates far more than this fund should take from one LP`,
      gate: over > 1.5 ? "capacity_mismatch" : null,
    }
  }
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
