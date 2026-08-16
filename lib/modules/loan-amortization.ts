/**
 * Loan amortization + accrual math — pure, no server deps (safe in client
 * components for the live schedule preview).
 *
 * Supports four repayment shapes:
 *   amortizing    — level payment; interest on the declining balance, principal
 *                   grows each period.
 *   interest_only — interest each period, full principal as a balloon at maturity.
 *   bullet        — no periodic payments; principal + all accrued interest at
 *                   maturity (single row).
 *   revolving     — a line; no fixed schedule (interest accrues on the drawn
 *                   balance) — returns an empty schedule.
 */

export type PaymentFrequency = "monthly" | "quarterly" | "semiannual" | "annual" | "bullet"
export type Amortization = "bullet" | "amortizing" | "interest_only" | "revolving"

export interface ScheduleRow {
  n: number
  date: string // YYYY-MM-DD
  payment: number
  interest: number
  principal: number
  balance: number
}

const PER_YEAR: Record<PaymentFrequency, number> = {
  monthly: 12, quarterly: 4, semiannual: 2, annual: 1, bullet: 0,
}

function addMonths(iso: string, months: number): string {
  const d = new Date(iso + "T00:00:00Z")
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}
function monthsBetween(a: string, b: string): number {
  const da = new Date(a + "T00:00:00Z"), db = new Date(b + "T00:00:00Z")
  return (db.getUTCFullYear() - da.getUTCFullYear()) * 12 + (db.getUTCMonth() - da.getUTCMonth())
}
const round2 = (v: number) => Math.round(v * 100) / 100

export interface ScheduleInput {
  principal: number
  annualRatePct: number
  originationDate: string | null
  maturityDate: string | null
  frequency: PaymentFrequency
  amortization: Amortization
}

/** Build the projected payment schedule. Empty when inputs are insufficient
 *  (missing dates) or for revolving lines. */
export function buildSchedule(input: ScheduleInput): ScheduleRow[] {
  const { principal, annualRatePct, originationDate, maturityDate, frequency, amortization } = input
  if (!originationDate || !maturityDate || principal <= 0) return []
  if (amortization === "revolving") return []

  const rate = (annualRatePct || 0) / 100

  // Bullet: one payment at maturity — principal + simple interest over the term.
  if (amortization === "bullet" || frequency === "bullet") {
    const years = Math.max(0, monthsBetween(originationDate, maturityDate)) / 12
    const interest = round2(principal * rate * years)
    return [{ n: 1, date: maturityDate, payment: round2(principal + interest), interest, principal: round2(principal), balance: 0 }]
  }

  const perYear = PER_YEAR[frequency] || 12
  const periodMonths = 12 / perYear
  const totalMonths = Math.max(periodMonths, monthsBetween(originationDate, maturityDate))
  const n = Math.max(1, Math.round(totalMonths / periodMonths))
  const i = rate / perYear // periodic rate

  const rows: ScheduleRow[] = []
  let balance = principal

  if (amortization === "interest_only") {
    const interest = round2(balance * i)
    for (let k = 1; k <= n; k++) {
      const date = addMonths(originationDate, Math.round(k * periodMonths))
      const isLast = k === n
      const principalPaid = isLast ? round2(balance) : 0
      rows.push({ n: k, date, payment: round2(interest + principalPaid), interest, principal: principalPaid, balance: isLast ? 0 : round2(balance) })
    }
    return rows
  }

  // Amortizing (level payment).
  const payment = i > 0 ? (principal * i) / (1 - Math.pow(1 + i, -n)) : principal / n
  for (let k = 1; k <= n; k++) {
    const date = addMonths(originationDate, Math.round(k * periodMonths))
    const interest = round2(balance * i)
    let principalPaid = round2(payment - interest)
    if (k === n || principalPaid > balance) principalPaid = round2(balance) // clear any rounding remainder on the last row
    balance = round2(balance - principalPaid)
    rows.push({ n: k, date, payment: round2(interest + principalPaid), interest, principal: principalPaid, balance })
  }
  return rows
}

/** Accrued interest on an outstanding balance since a date, Actual/365 simple. */
export function accruedInterest(outstanding: number, annualRatePct: number, sinceDate: string | null, asOf = new Date()): number {
  if (!sinceDate || outstanding <= 0 || !annualRatePct) return 0
  const since = new Date(sinceDate + "T00:00:00Z").getTime()
  const days = Math.max(0, Math.floor((asOf.getTime() - since) / 86400000))
  return round2(outstanding * (annualRatePct / 100) * (days / 365))
}

/** Total interest across a schedule. */
export function totalInterest(rows: ScheduleRow[]): number {
  return round2(rows.reduce((s, r) => s + r.interest, 0))
}
