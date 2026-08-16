import { sql } from "@/lib/db"
import {
  buildSchedule, accruedInterest, type ScheduleRow,
  type PaymentFrequency, type Amortization,
} from "@/lib/modules/loan-amortization"

/**
 * Loan servicing — the payment ledger, interest accrual, covenants, and derived
 * outstanding balance behind each loan. outstanding is DERIVED (principal minus
 * cumulative principal paid), recomputed on every payment change.
 */

const num = (v: any) => (v == null ? 0 : Number(v))
const round2 = (v: number) => Math.round(v * 100) / 100

export interface LoanFull {
  id: string; borrower: string; principal: number; outstanding: number | null
  interest_rate: number | null; origination_date: string | null; maturity_date: string | null
  amortization: Amortization; payment_frequency: PaymentFrequency
  status: "active" | "repaid" | "default" | "written_off"; notes: string | null; created_at: string
}
function normLoan(r: any): LoanFull {
  return {
    id: r.id, borrower: r.borrower, principal: num(r.principal),
    outstanding: r.outstanding != null ? num(r.outstanding) : null,
    interest_rate: r.interest_rate != null ? num(r.interest_rate) : null,
    origination_date: r.origination_date ? String(r.origination_date) : null,
    maturity_date: r.maturity_date ? String(r.maturity_date) : null,
    amortization: r.amortization, payment_frequency: r.payment_frequency ?? "monthly",
    status: r.status, notes: r.notes ?? null, created_at: String(r.created_at),
  }
}

export interface LoanPayment {
  id: string; paid_on: string; amount: number; principal_portion: number; interest_portion: number
  kind: "scheduled" | "interest" | "prepayment" | "payoff"; note: string | null
}
export interface LoanCovenant {
  id: string; name: string; kind: "financial" | "reporting" | "affirmative" | "negative"
  requirement: string | null; status: "ok" | "at_risk" | "breached" | "waived"; tested_at: string | null; note: string | null
}

async function ownedLoan(userId: string, loanId: string): Promise<LoanFull | null> {
  const rows = await sql`SELECT * FROM loans WHERE id = ${loanId} AND created_by = ${userId} LIMIT 1`
  return rows[0] ? normLoan(rows[0]) : null
}
export const getLoan = ownedLoan

// ── outstanding is derived from the payment ledger ──────────────────────────
async function recomputeOutstanding(loanId: string): Promise<void> {
  await sql`
    UPDATE loans SET outstanding = GREATEST(0, principal - COALESCE((
      SELECT SUM(principal_portion) FROM loan_payments WHERE loan_id = ${loanId}
    ), 0)), updated_at = now()
    WHERE id = ${loanId}`
}

export async function listPayments(loanId: string): Promise<LoanPayment[]> {
  const rows = await sql`
    SELECT id, to_char(paid_on,'YYYY-MM-DD') AS paid_on, amount, principal_portion, interest_portion, kind, note
    FROM loan_payments WHERE loan_id = ${loanId} ORDER BY paid_on, created_at`
  return (rows as any[]).map((r) => ({
    id: r.id, paid_on: r.paid_on, amount: num(r.amount),
    principal_portion: num(r.principal_portion), interest_portion: num(r.interest_portion),
    kind: r.kind, note: r.note ?? null,
  }))
}

/** Record a payment. Splits the amount into interest (accrued since the last
 *  payment/origination) then principal — unless it's an interest-only payment. */
export async function addPayment(input: {
  userId: string; loanId: string; paidOn: string; amount: number
  kind?: LoanPayment["kind"]; note?: string | null
}): Promise<LoanPayment | null> {
  const loan = await ownedLoan(input.userId, input.loanId)
  if (!loan) return null
  const kind = input.kind ?? "scheduled"
  const outstanding = loan.outstanding ?? loan.principal

  const last = await sql`SELECT to_char(MAX(paid_on),'YYYY-MM-DD') AS d FROM loan_payments WHERE loan_id = ${input.loanId}`
  const since = (last[0] as any)?.d || loan.origination_date
  const accrued = accruedInterest(outstanding, loan.interest_rate ?? 0, since, new Date(input.paidOn + "T00:00:00Z"))

  let interest_portion: number, principal_portion: number
  if (kind === "interest") {
    interest_portion = round2(input.amount); principal_portion = 0
  } else {
    interest_portion = round2(Math.min(input.amount, accrued))
    principal_portion = Math.min(round2(input.amount - interest_portion), outstanding)
  }

  const rows = await sql`
    INSERT INTO loan_payments (loan_id, paid_on, amount, principal_portion, interest_portion, kind, note)
    VALUES (${input.loanId}, ${input.paidOn}::date, ${round2(input.amount)}, ${principal_portion}, ${interest_portion}, ${kind}, ${input.note ?? null})
    RETURNING id, to_char(paid_on,'YYYY-MM-DD') AS paid_on, amount, principal_portion, interest_portion, kind, note`
  await recomputeOutstanding(input.loanId)
  const r: any = rows[0]
  return { id: r.id, paid_on: r.paid_on, amount: num(r.amount), principal_portion: num(r.principal_portion), interest_portion: num(r.interest_portion), kind: r.kind, note: r.note ?? null }
}

export async function removePayment(userId: string, loanId: string, paymentId: string): Promise<boolean> {
  if (!(await ownedLoan(userId, loanId))) return false
  await sql`DELETE FROM loan_payments WHERE id = ${paymentId} AND loan_id = ${loanId}`
  await recomputeOutstanding(loanId)
  return true
}

// ── covenants ────────────────────────────────────────────────────────────────
export async function listCovenants(loanId: string): Promise<LoanCovenant[]> {
  const rows = await sql`
    SELECT id, name, kind, requirement, status, to_char(tested_at,'YYYY-MM-DD') AS tested_at, note
    FROM loan_covenants WHERE loan_id = ${loanId} ORDER BY created_at`
  return rows as any[] as LoanCovenant[]
}
export async function addCovenant(input: {
  userId: string; loanId: string; name: string; kind?: LoanCovenant["kind"]; requirement?: string | null
}): Promise<LoanCovenant | null> {
  if (!(await ownedLoan(input.userId, input.loanId))) return null
  const rows = await sql`
    INSERT INTO loan_covenants (loan_id, name, kind, requirement)
    VALUES (${input.loanId}, ${input.name.trim()}, ${input.kind ?? "financial"}, ${input.requirement ?? null})
    RETURNING id, name, kind, requirement, status, to_char(tested_at,'YYYY-MM-DD') AS tested_at, note`
  return rows[0] as any as LoanCovenant
}
export async function setCovenant(userId: string, loanId: string, covId: string, patch: { status?: LoanCovenant["status"]; note?: string | null }): Promise<boolean> {
  if (!(await ownedLoan(userId, loanId))) return false
  await sql`
    UPDATE loan_covenants SET
      status = COALESCE(${patch.status ?? null}, status),
      note = COALESCE(${patch.note ?? null}, note),
      tested_at = CASE WHEN ${patch.status ?? null} IS NOT NULL THEN CURRENT_DATE ELSE tested_at END
    WHERE id = ${covId} AND loan_id = ${loanId}`
  return true
}
export async function removeCovenant(userId: string, loanId: string, covId: string): Promise<boolean> {
  if (!(await ownedLoan(userId, loanId))) return false
  await sql`DELETE FROM loan_covenants WHERE id = ${covId} AND loan_id = ${loanId}`
  return true
}

// ── loan status / terms ──────────────────────────────────────────────────────
export async function setLoanStatus(userId: string, loanId: string, status: LoanFull["status"]): Promise<LoanFull | null> {
  const rows = await sql`UPDATE loans SET status = ${status}, updated_at = now() WHERE id = ${loanId} AND created_by = ${userId} RETURNING *`
  return rows[0] ? normLoan(rows[0]) : null
}
export async function updateLoanTerms(userId: string, loanId: string, patch: {
  rate?: number | null; maturity?: string | null; frequency?: PaymentFrequency | null; amortization?: Amortization | null
}): Promise<LoanFull | null> {
  const rows = await sql`
    UPDATE loans SET
      interest_rate     = COALESCE(${patch.rate ?? null}, interest_rate),
      maturity_date     = COALESCE(${patch.maturity ?? null}::date, maturity_date),
      payment_frequency = COALESCE(${patch.frequency ?? null}, payment_frequency),
      amortization      = COALESCE(${patch.amortization ?? null}, amortization),
      updated_at = now()
    WHERE id = ${loanId} AND created_by = ${userId} RETURNING *`
  return rows[0] ? normLoan(rows[0]) : null
}

// ── servicing rollup ─────────────────────────────────────────────────────────
export interface LoanServicing {
  outstanding: number
  principalPaid: number
  interestPaid: number
  totalPaid: number
  accruedInterest: number
  schedule: ScheduleRow[]
  nextDue: ScheduleRow | null
}

export async function getLoanServicing(loan: LoanFull): Promise<LoanServicing> {
  const pays = await listPayments(loan.id)
  const principalPaid = round2(pays.reduce((s, p) => s + p.principal_portion, 0))
  const interestPaid = round2(pays.reduce((s, p) => s + p.interest_portion, 0))
  const outstanding = loan.outstanding ?? round2(loan.principal - principalPaid)

  const lastPay = pays.length ? pays[pays.length - 1].paid_on : loan.origination_date
  const accrued = accruedInterest(outstanding, loan.interest_rate ?? 0, lastPay)

  const schedule = buildSchedule({
    principal: loan.principal, annualRatePct: loan.interest_rate ?? 0,
    originationDate: loan.origination_date, maturityDate: loan.maturity_date,
    frequency: loan.payment_frequency, amortization: loan.amortization,
  })
  const today = new Date().toISOString().slice(0, 10)
  const nextDue = schedule.find((r) => r.date >= today) ?? null

  return { outstanding, principalPaid, interestPaid, totalPaid: round2(principalPaid + interestPaid), accruedInterest: accrued, schedule, nextDue }
}
