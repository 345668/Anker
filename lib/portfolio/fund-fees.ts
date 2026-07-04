/**
 * Management fees — schedule + quarterly accruals (Phase 4 of
 * FUND_OPS_DESIGN.md §3.3).
 *
 * The schedule holds the LPA terms (annual %, base, step-down, term);
 * generateAccruals() materialises one accrual per completed quarter from
 * start_date through today, idempotently (UNIQUE fund_id + period_end).
 *
 * The fee base is measured FROM THE RECORD at generation time:
 *   committed → Σ fund_lps.commitment_amount
 *   called    → Σ paid capital-call line amounts up to the period end
 *   invested  → Σ investments.cost_basis with invested_at ≤ period end
 *
 * Ledger hand-off: the Phase-3 rebuild books each accrual as
 *   DR 5000 Management fees / CR 2000 Due to manager      (accrued)
 *   DR 2000 Due to manager  / CR 1000 Cash                (when paid)
 * via bookFeeEntries(), called from rebuildJournal.
 */

import { sql } from "@/lib/db"

// ── types ───────────────────────────────────────────────────────────────

export type FeeBase = "committed" | "called" | "invested"
export type AccrualStatus = "accrued" | "paid" | "waived"

export interface FeeSchedule {
  id: string
  fund_id: string
  annual_fee_pct: number
  fee_base: FeeBase
  start_date: string
  term_years: number
  stepdown_after_years: number
  stepdown_fee_pct: number | null
  notes: string | null
  updated_at: string
}

export interface FeeAccrual {
  id: string
  fund_id: string
  period_end: string
  base_kind: FeeBase
  base_amount: number
  fee_pct: number
  fee_amount: number
  status: AccrualStatus
  paid_at: string | null
}

// ── schema-drift guard ──────────────────────────────────────────────────

let probe: Promise<boolean> | null = null
export function hasFeeTables(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const rows = await sql`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('fee_schedules', 'fee_accruals')`
        return rows.length === 2
      } catch { return false }
    })()
  }
  return probe
}

// ── schedule ────────────────────────────────────────────────────────────

const d = (v: any): string =>
  typeof v === "string" ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10)

function normalizeSchedule(r: any): FeeSchedule {
  return {
    id: r.id,
    fund_id: r.fund_id,
    annual_fee_pct: Number(r.annual_fee_pct),
    fee_base: r.fee_base,
    start_date: d(r.start_date),
    term_years: Number(r.term_years),
    stepdown_after_years: Number(r.stepdown_after_years),
    stepdown_fee_pct: r.stepdown_fee_pct == null ? null : Number(r.stepdown_fee_pct),
    notes: r.notes ?? null,
    updated_at: String(r.updated_at),
  }
}

export async function getFeeSchedule(fundId: string): Promise<FeeSchedule | null> {
  if (!(await hasFeeTables())) return null
  const rows = await sql`SELECT * FROM fee_schedules WHERE fund_id = ${fundId} LIMIT 1`
  return rows[0] ? normalizeSchedule(rows[0]) : null
}

export interface UpsertScheduleInput {
  fundId: string
  annualFeePct: number
  feeBase: FeeBase
  startDate: string
  termYears?: number
  stepdownAfterYears?: number
  stepdownFeePct?: number | null
  notes?: string | null
}

export async function upsertFeeSchedule(input: UpsertScheduleInput): Promise<FeeSchedule> {
  await sql`
    INSERT INTO fee_schedules (
      fund_id, annual_fee_pct, fee_base, start_date, term_years,
      stepdown_after_years, stepdown_fee_pct, notes, updated_at
    ) VALUES (
      ${input.fundId}, ${input.annualFeePct}, ${input.feeBase}, ${input.startDate},
      ${input.termYears ?? 10}, ${input.stepdownAfterYears ?? 0},
      ${input.stepdownFeePct ?? null}, ${input.notes ?? null}, NOW()
    )
    ON CONFLICT (fund_id) DO UPDATE SET
      annual_fee_pct = EXCLUDED.annual_fee_pct,
      fee_base = EXCLUDED.fee_base,
      start_date = EXCLUDED.start_date,
      term_years = EXCLUDED.term_years,
      stepdown_after_years = EXCLUDED.stepdown_after_years,
      stepdown_fee_pct = EXCLUDED.stepdown_fee_pct,
      notes = EXCLUDED.notes,
      updated_at = NOW()`
  return (await getFeeSchedule(input.fundId))!
}

// ── accruals ────────────────────────────────────────────────────────────

function normalizeAccrual(r: any): FeeAccrual {
  return {
    id: r.id,
    fund_id: r.fund_id,
    period_end: d(r.period_end),
    base_kind: r.base_kind,
    base_amount: Number(r.base_amount),
    fee_pct: Number(r.fee_pct),
    fee_amount: Number(r.fee_amount),
    status: r.status,
    paid_at: r.paid_at ? String(r.paid_at) : null,
  }
}

export async function listAccruals(fundId: string): Promise<FeeAccrual[]> {
  if (!(await hasFeeTables())) return []
  const rows = await sql`
    SELECT * FROM fee_accruals WHERE fund_id = ${fundId} ORDER BY period_end ASC`
  return rows.map(normalizeAccrual)
}

/** Quarter ends between start (inclusive quarter) and today (completed only). */
function quarterEnds(startDate: string, termYears: number): string[] {
  const ends: string[] = []
  const start = new Date(startDate + "T00:00:00Z")
  const today = new Date()
  const limit = new Date(start)
  limit.setUTCFullYear(limit.getUTCFullYear() + termYears)
  // First quarter end on/after the start date
  let y = start.getUTCFullYear()
  let q = Math.floor(start.getUTCMonth() / 3) + 1
  for (let i = 0; i < termYears * 4 + 4; i++) {
    const month = q * 3                        // 3,6,9,12
    const end = new Date(Date.UTC(y, month, 0)) // day 0 of next month = last day
    if (end >= today || end > limit) break
    if (end >= start) ends.push(end.toISOString().slice(0, 10))
    q++
    if (q > 4) { q = 1; y++ }
  }
  return ends
}

async function measureBase(fundId: string, base: FeeBase, periodEnd: string): Promise<number> {
  try {
    if (base === "committed") {
      const [r] = await sql`
        SELECT COALESCE(SUM(commitment_amount), 0) AS v FROM fund_lps
         WHERE fund_id = ${fundId} AND status != 'transferred'` as any[]
      return Number(r.v) || 0
    }
    if (base === "called") {
      const [r] = await sql`
        SELECT COALESCE(SUM(cli.amount), 0) AS v
          FROM capital_call_line_items cli
          JOIN capital_calls cc ON cc.id = cli.call_id
         WHERE cc.fund_id = ${fundId} AND cli.status = 'paid'
           AND COALESCE(cli.paid_at, cc.created_at) <= ${periodEnd}::date + 1` as any[]
      return Number(r.v) || 0
    }
    // invested
    const [r] = await sql`
      SELECT COALESCE(SUM(cost_basis), 0) AS v FROM investments
       WHERE fund_id = ${fundId} AND (invested_at IS NULL OR invested_at <= ${periodEnd})` as any[]
    return Number(r.v) || 0
  } catch {
    return 0
  }
}

export interface GenerateAccrualsResult {
  created: number
  skippedExisting: number
  periods: string[]
}

/** Materialise accruals for every completed quarter. Idempotent. */
export async function generateAccruals(fundId: string): Promise<GenerateAccrualsResult> {
  const schedule = await getFeeSchedule(fundId)
  if (!schedule) throw new Error("No fee schedule set for this fund yet.")

  const existing = new Set((await listAccruals(fundId)).map((a) => a.period_end))
  const result: GenerateAccrualsResult = { created: 0, skippedExisting: 0, periods: [] }

  for (const periodEnd of quarterEnds(schedule.start_date, schedule.term_years)) {
    if (existing.has(periodEnd)) { result.skippedExisting++; continue }
    // Step-down check: years elapsed at period end
    const yearsIn =
      (new Date(periodEnd).getTime() - new Date(schedule.start_date).getTime()) /
      (365.25 * 24 * 3600 * 1000)
    const pct =
      schedule.stepdown_after_years > 0 &&
      schedule.stepdown_fee_pct != null &&
      yearsIn >= schedule.stepdown_after_years
        ? schedule.stepdown_fee_pct
        : schedule.annual_fee_pct
    const baseAmount = await measureBase(fundId, schedule.fee_base, periodEnd)
    const feeAmount = Math.round(baseAmount * pct / 4 * 100) / 100
    await sql`
      INSERT INTO fee_accruals (fund_id, period_end, base_kind, base_amount, fee_pct, fee_amount)
      VALUES (${fundId}, ${periodEnd}, ${schedule.fee_base}, ${baseAmount}, ${pct}, ${feeAmount})
      ON CONFLICT (fund_id, period_end) DO NOTHING`
    result.created++
    result.periods.push(periodEnd)
  }
  return result
}

export async function setAccrualStatus(
  id: string,
  status: AccrualStatus,
): Promise<FeeAccrual | null> {
  const rows = await sql`
    UPDATE fee_accruals SET
      status = ${status},
      paid_at = CASE WHEN ${status} = 'paid' THEN COALESCE(paid_at, NOW()) ELSE NULL END
    WHERE id = ${id} RETURNING *`
  return rows[0] ? normalizeAccrual(rows[0]) : null
}

// ── ledger hand-off ─────────────────────────────────────────────────────

/**
 * Book fee entries during the Phase-3 journal rebuild. For each accrual:
 *   accrued/paid → DR 5000 / CR 2000 on period_end
 *   paid         → additionally DR 2000 / CR 1000 on paid_at
 * Waived accruals book nothing.
 * Returns entry count. Uses the caller-provided postEntry to avoid a
 * circular import with fund-ledger.
 */
export async function bookFeeEntries(
  fundId: string,
  post: (input: {
    fundId: string; entryDate: string; memo: string;
    lines: { accountCode: string; debit?: number; credit?: number }[];
    sourceKind: "fee_accrual"; sourceId: string; createdBy: string | null;
  }) => Promise<string>,
  by: string | null,
): Promise<number> {
  if (!(await hasFeeTables())) return 0
  const accruals = await listAccruals(fundId)
  let n = 0
  for (const a of accruals) {
    if (a.status === "waived" || a.fee_amount <= 0) continue
    await post({
      fundId, entryDate: a.period_end,
      memo: `Management fee accrual — quarter ending ${a.period_end}`,
      lines: [
        { accountCode: "5000", debit: a.fee_amount },
        { accountCode: "2000", credit: a.fee_amount },
      ],
      sourceKind: "fee_accrual", sourceId: a.id, createdBy: by,
    })
    n++
    if (a.status === "paid") {
      await post({
        fundId, entryDate: a.paid_at ? a.paid_at.slice(0, 10) : a.period_end,
        memo: `Management fee paid — quarter ending ${a.period_end}`,
        lines: [
          { accountCode: "2000", debit: a.fee_amount },
          { accountCode: "1000", credit: a.fee_amount },
        ],
        sourceKind: "fee_accrual", sourceId: `${a.id}:paid`, createdBy: by,
      })
      n++
    }
  }
  return n
}
