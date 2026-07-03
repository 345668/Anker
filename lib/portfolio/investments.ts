/**
 * Investments — the fund-ops spine (Phase 1 of FUND_OPS_DESIGN.md).
 *
 * One row per fund × company × security event. Valuation snapshots are an
 * immutable event log; a position's current fair value is its latest
 * snapshot (by as_of_date, then created_at). Fund NAV is the sum of
 * current fair values over active positions.
 *
 * This module also computes the fund-level performance metrics that
 * capital-account.ts has been waiting for: with a NAV of record we can
 * derive TVPI / RVPI / IRR from the same call + distribution line items
 * the statements already read — no hand-fed numbers.
 *
 * Schema-drift guard: hasInvestmentsTables() probes information_schema
 * once per process and the public API degrades gracefully when the
 * phase-1 migration hasn't run (same pattern as legal-reviews.ts).
 */

import { sql } from "@/lib/db"

// ── types ───────────────────────────────────────────────────────────────

export const INVESTMENT_KINDS = ["initial", "follow_on", "studio_common", "secondary", "bridge", "other"] as const
export type InvestmentKind = (typeof INVESTMENT_KINDS)[number]

export const SECURITY_TYPES = ["safe", "convertible_note", "preferred", "common", "warrant", "other"] as const
export type SecurityType = (typeof SECURITY_TYPES)[number]

export const INVESTMENT_STATUSES = ["active", "exited", "written_off"] as const
export type InvestmentStatus = (typeof INVESTMENT_STATUSES)[number]

export const VALUATION_METHODS = ["cost", "last_round", "mark", "write_down", "write_off", "exit"] as const
export type ValuationMethod = (typeof VALUATION_METHODS)[number]

export interface InvestmentFull {
  id: string
  fund_id: string
  company_id: string | null
  company_name: string
  investment_kind: InvestmentKind
  security_type: SecurityType
  round_name: string | null
  invested_at: string | null
  cost_basis: number
  share_count: number | null
  fully_diluted_pct: number | null
  round_valuation: number | null
  status: InvestmentStatus
  exited_at: string | null
  realized_proceeds: number
  notes: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
  /** Latest mark — joined in listInvestments. Null until first snapshot. */
  current_fair_value: number | null
  current_value_method: ValuationMethod | null
  current_value_as_of: string | null
}

export interface ValuationSnapshotFull {
  id: string
  investment_id: string
  fund_id: string
  as_of_date: string
  fair_value: number
  method: ValuationMethod
  source: string | null
  note: string | null
  created_by: string | null
  created_at: string
}

export interface FundNav {
  fundId: string
  asOf: string
  /** Σ current fair value over active positions. */
  positionsFairValue: number
  /** Σ cost basis over active positions. */
  activeCostBasis: number
  totalInvested: number          // all positions incl. exited, at cost
  realizedProceeds: number       // Σ realized_proceeds
  unrealizedGain: number         // positionsFairValue - activeCostBasis
  positionCount: number
  activePositionCount: number
  markedPositionCount: number    // active positions with ≥1 snapshot
}

export interface FundPerformance {
  nav: FundNav
  totalCalled: number            // paid capital-call lines
  totalDistributed: number       // paid distribution lines
  dpi: number | null
  rvpi: number | null
  tvpi: number | null
  /** Gross MOIC on invested capital: (FV + realized) / total invested. */
  grossMoic: number | null
  /** Simple annual net IRR from dated LP cashflows + terminal NAV. */
  netIrr: number | null
}

// ── schema-drift guard ──────────────────────────────────────────────────

let tablesProbe: Promise<boolean> | null = null
export function hasInvestmentsTables(): Promise<boolean> {
  if (!tablesProbe) {
    tablesProbe = (async () => {
      try {
        const rows = await sql`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name IN ('investments', 'valuation_snapshots')`
        return rows.length === 2
      } catch {
        return false
      }
    })()
  }
  return tablesProbe
}

// ── normalize ───────────────────────────────────────────────────────────

const num = (v: any): number => (v == null ? 0 : Number(v))
const numOrNull = (v: any): number | null => (v == null ? null : Number(v))
const dateStr = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v : new Date(v).toISOString().slice(0, 10)

function normalizeInvestment(r: any): InvestmentFull {
  return {
    id: r.id,
    fund_id: r.fund_id,
    company_id: r.company_id ?? null,
    company_name: r.company_name,
    investment_kind: r.investment_kind,
    security_type: r.security_type,
    round_name: r.round_name ?? null,
    invested_at: dateStr(r.invested_at),
    cost_basis: num(r.cost_basis),
    share_count: numOrNull(r.share_count),
    fully_diluted_pct: numOrNull(r.fully_diluted_pct),
    round_valuation: numOrNull(r.round_valuation),
    status: r.status,
    exited_at: dateStr(r.exited_at),
    realized_proceeds: num(r.realized_proceeds),
    notes: r.notes ?? null,
    metadata: r.metadata ?? {},
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    current_fair_value: numOrNull(r.current_fair_value),
    current_value_method: r.current_value_method ?? null,
    current_value_as_of: dateStr(r.current_value_as_of),
  }
}

function normalizeSnapshot(r: any): ValuationSnapshotFull {
  return {
    id: r.id,
    investment_id: r.investment_id,
    fund_id: r.fund_id,
    as_of_date: dateStr(r.as_of_date)!,
    fair_value: num(r.fair_value),
    method: r.method,
    source: r.source ?? null,
    note: r.note ?? null,
    created_by: r.created_by ?? null,
    created_at: String(r.created_at),
  }
}

// ── investments: read ───────────────────────────────────────────────────

/** All positions for a fund with their latest mark joined in. */
export async function listInvestments(fundId: string): Promise<InvestmentFull[]> {
  if (!(await hasInvestmentsTables())) return []
  const rows = await sql`
    SELECT i.*,
           v.fair_value  AS current_fair_value,
           v.method      AS current_value_method,
           v.as_of_date  AS current_value_as_of
      FROM investments i
      LEFT JOIN LATERAL (
        SELECT fair_value, method, as_of_date
          FROM valuation_snapshots
         WHERE investment_id = i.id
         ORDER BY as_of_date DESC, created_at DESC
         LIMIT 1
      ) v ON TRUE
     WHERE i.fund_id = ${fundId}
     ORDER BY i.invested_at DESC NULLS LAST, i.created_at DESC
  `
  return rows.map(normalizeInvestment)
}

export async function getInvestmentById(id: string): Promise<InvestmentFull | null> {
  if (!(await hasInvestmentsTables())) return null
  const rows = await sql`
    SELECT i.*,
           v.fair_value  AS current_fair_value,
           v.method      AS current_value_method,
           v.as_of_date  AS current_value_as_of
      FROM investments i
      LEFT JOIN LATERAL (
        SELECT fair_value, method, as_of_date
          FROM valuation_snapshots
         WHERE investment_id = i.id
         ORDER BY as_of_date DESC, created_at DESC
         LIMIT 1
      ) v ON TRUE
     WHERE i.id = ${id} LIMIT 1
  `
  return rows[0] ? normalizeInvestment(rows[0]) : null
}

// ── investments: write ──────────────────────────────────────────────────

export interface CreateInvestmentInput {
  fundId: string
  companyId?: string | null
  companyName: string
  investmentKind?: InvestmentKind
  securityType?: SecurityType
  roundName?: string | null
  investedAt?: string | null      // YYYY-MM-DD
  costBasis: number
  shareCount?: number | null
  fullyDilutedPct?: number | null
  roundValuation?: number | null
  notes?: string | null
  /** Seed the first valuation snapshot at cost (default true). This is the
   *  "close" behaviour from the design: a new position is marked at cost
   *  on day one so NAV is defined immediately. */
  seedValuationAtCost?: boolean
  createdBy?: string | null
}

export async function createInvestment(input: CreateInvestmentInput): Promise<InvestmentFull> {
  const rows = await sql`
    INSERT INTO investments (
      fund_id, company_id, company_name, investment_kind, security_type,
      round_name, invested_at, cost_basis, share_count, fully_diluted_pct,
      round_valuation, notes
    ) VALUES (
      ${input.fundId},
      ${input.companyId ?? null},
      ${input.companyName.trim()},
      ${input.investmentKind ?? "initial"},
      ${input.securityType ?? "preferred"},
      ${input.roundName ?? null},
      ${input.investedAt ?? null},
      ${Math.max(0, Number(input.costBasis) || 0)},
      ${input.shareCount ?? null},
      ${input.fullyDilutedPct ?? null},
      ${input.roundValuation ?? null},
      ${input.notes ?? null}
    )
    RETURNING *`
  const inv = rows[0]

  if (input.seedValuationAtCost !== false) {
    const asOf = input.investedAt ?? new Date().toISOString().slice(0, 10)
    await sql`
      INSERT INTO valuation_snapshots (investment_id, fund_id, as_of_date, fair_value, method, source, note, created_by)
      VALUES (${inv.id}, ${input.fundId}, ${asOf},
              ${Math.max(0, Number(input.costBasis) || 0)}, 'cost',
              'initial', 'Seeded at cost on position creation.',
              ${input.createdBy ?? null})`
  }
  return (await getInvestmentById(inv.id))!
}

export interface UpdateInvestmentInput {
  companyId?: string | null
  companyName?: string
  investmentKind?: InvestmentKind
  securityType?: SecurityType
  roundName?: string | null
  investedAt?: string | null
  costBasis?: number
  shareCount?: number | null
  fullyDilutedPct?: number | null
  roundValuation?: number | null
  status?: InvestmentStatus
  exitedAt?: string | null
  realizedProceeds?: number
  notes?: string | null
}

export async function updateInvestment(id: string, patch: UpdateInvestmentInput): Promise<InvestmentFull | null> {
  const existing = await getInvestmentById(id)
  if (!existing) return null
  await sql`
    UPDATE investments SET
      company_id        = ${patch.companyId !== undefined ? patch.companyId : existing.company_id},
      company_name      = ${patch.companyName !== undefined ? patch.companyName.trim() : existing.company_name},
      investment_kind   = ${patch.investmentKind ?? existing.investment_kind},
      security_type     = ${patch.securityType ?? existing.security_type},
      round_name        = ${patch.roundName !== undefined ? patch.roundName : existing.round_name},
      invested_at       = ${patch.investedAt !== undefined ? patch.investedAt : existing.invested_at},
      cost_basis        = ${patch.costBasis !== undefined ? Math.max(0, Number(patch.costBasis) || 0) : existing.cost_basis},
      share_count       = ${patch.shareCount !== undefined ? patch.shareCount : existing.share_count},
      fully_diluted_pct = ${patch.fullyDilutedPct !== undefined ? patch.fullyDilutedPct : existing.fully_diluted_pct},
      round_valuation   = ${patch.roundValuation !== undefined ? patch.roundValuation : existing.round_valuation},
      status            = ${patch.status ?? existing.status},
      exited_at         = ${patch.exitedAt !== undefined ? patch.exitedAt : existing.exited_at},
      realized_proceeds = ${patch.realizedProceeds !== undefined ? Math.max(0, Number(patch.realizedProceeds) || 0) : existing.realized_proceeds},
      notes             = ${patch.notes !== undefined ? patch.notes : existing.notes},
      updated_at        = NOW()
    WHERE id = ${id}`
  return getInvestmentById(id)
}

export async function deleteInvestment(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM investments WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

// ── valuations ──────────────────────────────────────────────────────────

export async function listSnapshots(investmentId: string): Promise<ValuationSnapshotFull[]> {
  if (!(await hasInvestmentsTables())) return []
  const rows = await sql`
    SELECT * FROM valuation_snapshots
     WHERE investment_id = ${investmentId}
     ORDER BY as_of_date DESC, created_at DESC`
  return rows.map(normalizeSnapshot)
}

export interface AddSnapshotInput {
  investmentId: string
  fundId: string
  asOfDate: string               // YYYY-MM-DD
  fairValue: number
  method?: ValuationMethod
  source?: string | null
  note?: string | null
  createdBy?: string | null
}

export async function addSnapshot(input: AddSnapshotInput): Promise<ValuationSnapshotFull> {
  const rows = await sql`
    INSERT INTO valuation_snapshots (investment_id, fund_id, as_of_date, fair_value, method, source, note, created_by)
    VALUES (${input.investmentId}, ${input.fundId}, ${input.asOfDate},
            ${Math.max(0, Number(input.fairValue) || 0)},
            ${input.method ?? "mark"}, ${input.source ?? null},
            ${input.note ?? null}, ${input.createdBy ?? null})
    RETURNING *`
  // Marking to zero via write_off flips the position status too — one
  // action, consistent record.
  if ((input.method === "write_off") || (Number(input.fairValue) === 0 && input.method !== "exit")) {
    await sql`UPDATE investments SET status = 'written_off', updated_at = NOW()
               WHERE id = ${input.investmentId} AND status = 'active'`
  }
  return normalizeSnapshot(rows[0])
}

// ── NAV + performance ───────────────────────────────────────────────────

export async function getFundNav(fundId: string): Promise<FundNav | null> {
  if (!(await hasInvestmentsTables())) return null
  const positions = await listInvestments(fundId)
  const active = positions.filter((p) => p.status === "active")
  const positionsFairValue = active.reduce(
    (s, p) => s + (p.current_fair_value ?? p.cost_basis), 0)
  const activeCostBasis = active.reduce((s, p) => s + p.cost_basis, 0)
  return {
    fundId,
    asOf: new Date().toISOString().slice(0, 10),
    positionsFairValue,
    activeCostBasis,
    totalInvested: positions.reduce((s, p) => s + p.cost_basis, 0),
    realizedProceeds: positions.reduce((s, p) => s + p.realized_proceeds, 0),
    unrealizedGain: positionsFairValue - activeCostBasis,
    positionCount: positions.length,
    activePositionCount: active.length,
    markedPositionCount: active.filter((p) => p.current_fair_value != null).length,
  }
}

/**
 * Fund-level performance from the record: paid capital-call lines are the
 * LP inflows, paid distribution lines the outflows, NAV the terminal value.
 * Gracefully returns nulls when the underlying tables are missing.
 */
export async function getFundPerformance(fundId: string): Promise<FundPerformance | null> {
  const nav = await getFundNav(fundId)
  if (!nav) return null

  let called: { amount: number; at: string }[] = []
  let distributed: { amount: number; at: string }[] = []
  try {
    const rows = await sql`
      SELECT cli.amount, COALESCE(cli.paid_at, cc.sent_at, cc.created_at) AS at
        FROM capital_call_line_items cli
        JOIN capital_calls cc ON cc.id = cli.call_id
       WHERE cc.fund_id = ${fundId} AND cli.status = 'paid'`
    called = rows.map((r: any) => ({ amount: Number(r.amount) || 0, at: String(r.at) }))
  } catch { /* calls tables absent — leave empty */ }
  try {
    const rows = await sql`
      SELECT dli.amount, COALESCE(dli.paid_at, d.created_at) AS at
        FROM distribution_line_items dli
        JOIN distributions d ON d.id = dli.distribution_id
       WHERE d.fund_id = ${fundId} AND dli.status = 'paid'`
    distributed = rows.map((r: any) => ({ amount: Number(r.amount) || 0, at: String(r.at) }))
  } catch { /* distributions tables absent — leave empty */ }

  const totalCalled = called.reduce((s, c) => s + c.amount, 0)
  const totalDistributed = distributed.reduce((s, d) => s + d.amount, 0)

  const dpi = totalCalled > 0 ? totalDistributed / totalCalled : null
  const rvpi = totalCalled > 0 ? nav.positionsFairValue / totalCalled : null
  const tvpi = dpi != null && rvpi != null ? dpi + rvpi : null
  const grossMoic = nav.totalInvested > 0
    ? (nav.positionsFairValue + nav.realizedProceeds) / nav.totalInvested
    : null

  // IRR over dated cashflows (years from first flow), NAV as terminal.
  let netIrr: number | null = null
  const flows: { t: number; amount: number }[] = []
  const allDates = [...called.map((c) => c.at), ...distributed.map((d) => d.at)]
  if (allDates.length > 0 && totalCalled > 0) {
    const t0 = Math.min(...allDates.map((d) => new Date(d).getTime()))
    const yrs = (d: string) => (new Date(d).getTime() - t0) / (365.25 * 24 * 3600 * 1000)
    for (const c of called) flows.push({ t: yrs(c.at), amount: -c.amount })
    for (const d of distributed) flows.push({ t: yrs(d.at), amount: d.amount })
    const tNow = (Date.now() - t0) / (365.25 * 24 * 3600 * 1000)
    flows.push({ t: Math.max(tNow, 0.01), amount: nav.positionsFairValue })
    netIrr = irr(flows)
  }

  return { nav, totalCalled, totalDistributed, dpi, rvpi, tvpi, grossMoic, netIrr }
}

function irr(flows: { t: number; amount: number }[]): number | null {
  if (flows.length < 2) return null
  const hasNeg = flows.some((f) => f.amount < 0)
  const hasPos = flows.some((f) => f.amount > 0)
  if (!hasNeg || !hasPos) return null
  const npv = (rate: number) =>
    flows.reduce((s, f) => s + f.amount / Math.pow(1 + rate, f.t), 0)
  let r0 = 0.05, r1 = 0.20
  let n0 = npv(r0), n1 = npv(r1)
  for (let k = 0; k < 100; k++) {
    if (Math.abs(n1) < 0.5) return r1
    if (n1 === n0) break
    const r2 = Math.max(-0.95, Math.min(10, r1 - n1 * (r1 - r0) / (n1 - n0)))
    r0 = r1; n0 = n1; r1 = r2; n1 = npv(r1)
  }
  return Number.isFinite(r1) ? r1 : null
}
