/**
 * Vesting math — pure and client-safe (no DB import) so the detail view can
 * project a grant's vesting live as the founder edits terms, and the server
 * can reuse the exact same functions when it validates an exercise.
 *
 * Model: standard time-based vesting with a cliff.
 *   - Nothing vests before the cliff (e.g. 12mo of a 48mo schedule).
 *   - At the cliff, the elapsed fraction vests at once (12/48 = 25%).
 *   - Thereafter it accrues monthly, straight-line, to 100% at `vestMonths`.
 *   - Termination freezes vesting at the termination date; anything unvested
 *     at that point is forfeited.
 * Exercise is capped at vested-minus-already-exercised (no early exercise).
 */

export interface VestingInputs {
  totalOptions: number
  /** ISO date (yyyy-mm-dd) vesting starts from — usually the grant date. */
  vestingStart: string | null
  vestMonths: number
  cliffMonths: number
  /** ISO date vesting stopped (termination); null = still vesting. */
  terminatedOn?: string | null
}

export interface VestRow {
  /** 1-based month index from the vesting start. */
  month: number
  date: string
  vested: number
  /** Newly vested this month (delta from the previous row). */
  vestedThisMonth: number
  isCliff: boolean
}

export interface VestingResult {
  vested: number
  unvested: number
  /** Fraction 0–1 of the grant vested as of the reference date. */
  fractionVested: number
  /** Whole months of credited service as of the reference date (post-cap). */
  monthsElapsed: number
  cliffReached: boolean
  /** Fully-vested calendar date (or null if start unknown). */
  fullyVestedOn: string | null
}

function parse(d: string | null | undefined): Date | null {
  if (!d) return null
  const dt = new Date(d.length <= 10 ? `${d}T00:00:00` : d)
  return Number.isNaN(dt.getTime()) ? null : dt
}

/** Whole calendar months elapsed from `from` to `to` (day-of-month aware). */
export function monthsBetween(from: Date, to: Date): number {
  if (to <= from) return 0
  let m = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) m -= 1
  return Math.max(0, m)
}

/** Add `n` months to a date, clamping the day to the target month's length. */
function addMonths(d: Date, n: number): Date {
  const r = new Date(d)
  const day = r.getDate()
  r.setDate(1)
  r.setMonth(r.getMonth() + n)
  r.setDate(Math.min(day, daysInMonth(r.getFullYear(), r.getMonth())))
  return r
}
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Vested option count for `total` given elapsed/cliff/total months. */
export function vestedAt(total: number, monthsElapsed: number, vestMonths: number, cliffMonths: number): number {
  if (vestMonths <= 0) return total
  if (monthsElapsed < cliffMonths) return 0
  const capped = Math.min(monthsElapsed, vestMonths)
  return Math.min(total, Math.floor((total * capped) / vestMonths))
}

export function computeVesting(input: VestingInputs, asOf: Date = new Date()): VestingResult {
  const start = parse(input.vestingStart)
  const total = Math.max(0, Math.floor(input.totalOptions))
  const term = parse(input.terminatedOn ?? null)
  // Termination freezes the clock: never credit service past the term date.
  const effectiveAsOf = term && term < asOf ? term : asOf

  if (!start) {
    return { vested: 0, unvested: total, fractionVested: 0, monthsElapsed: 0, cliffReached: false, fullyVestedOn: null }
  }
  const monthsElapsed = monthsBetween(start, effectiveAsOf)
  const vested = vestedAt(total, monthsElapsed, input.vestMonths, input.cliffMonths)
  return {
    vested,
    unvested: total - vested,
    fractionVested: total > 0 ? vested / total : 0,
    monthsElapsed,
    cliffReached: monthsElapsed >= input.cliffMonths,
    fullyVestedOn: iso(addMonths(start, input.vestMonths)),
  }
}

/** Month-by-month cumulative vesting schedule for the full term. */
export function buildVestingSchedule(input: VestingInputs): VestRow[] {
  const start = parse(input.vestingStart)
  const total = Math.max(0, Math.floor(input.totalOptions))
  if (!start || input.vestMonths <= 0) return []
  const term = parse(input.terminatedOn ?? null)

  const rows: VestRow[] = []
  let prev = 0
  for (let m = 1; m <= input.vestMonths; m++) {
    const date = addMonths(start, m)
    // Once terminated, no further months vest.
    const frozen = term != null && date > term
    const vested = frozen ? prev : vestedAt(total, m, input.vestMonths, input.cliffMonths)
    rows.push({ month: m, date: iso(date), vested, vestedThisMonth: vested - prev, isCliff: m === input.cliffMonths })
    prev = vested
  }
  return rows
}

/** Options currently exercisable: vested minus what's already been exercised. */
export function exercisable(vested: number, exercised: number): number {
  return Math.max(0, vested - exercised)
}
