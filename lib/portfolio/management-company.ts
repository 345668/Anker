/**
 * Management company + studio operations — Phase 6 of FUND_OPS_DESIGN.md
 * (§3.4 budget vs. actuals + fee income, §3.5 studio projects).
 *
 * Three pieces:
 *
 * 1. BUDGET vs ACTUALS. mc_budget_lines hold the annual plan per category
 *    (the same categories the OpEx Pro-Forma tool uses); mc_actuals are
 *    spend entries. getVariance() folds both into a per-category,
 *    per-year variance view.
 *
 * 2. FEE INCOME — no new table. The management company's revenue is the
 *    other side of the fund's Phase-4 fee accruals: paid accruals are
 *    received income, accrued ones are receivable. getFeeIncome() reads
 *    fee_accruals directly.
 *
 * 3. STUDIO PROJECTS. idea → validation → build → spun_out pipeline
 *    (same state-machine + stage_history pattern as deals). spinout()
 *    is the studio's close action: creates the portfolio company, the
 *    fund's check as an investments row, and the studio's common stake
 *    as a second zero-cost investments row — from then on it's a normal
 *    portfolio company (KPIs, marks, NAV, reports all apply).
 */

import { sql } from "@/lib/db"
import { createInvestment } from "@/lib/portfolio/investments"
import { createCompany } from "@/lib/portfolio/queries"
import { getFundById } from "@/lib/portfolio/funds"

// ── constants (DB-free module so client components can import them) ─────

import { MC_CATEGORIES, STUDIO_STAGES, STUDIO_NEXT, type StudioStage } from "./mc-constants"
export { MC_CATEGORIES, STUDIO_STAGES }
export type { StudioStage }

// ── types ───────────────────────────────────────────────────────────────

export interface BudgetLine {
  id: string
  fund_id: string
  year: number
  category: string
  planned_amount: number
  notes: string | null
}

export interface McActual {
  id: string
  fund_id: string
  occurred_on: string
  category: string
  amount: number
  memo: string | null
}

export interface VarianceRow {
  category: string
  planned: number
  actual: number
  variance: number          // planned - actual (positive = under budget)
  pctUsed: number | null    // actual / planned
}

export interface McOverview {
  year: number
  rows: VarianceRow[]
  totalPlanned: number
  totalActual: number
  totalVariance: number
  feeIncome: {
    received: number         // paid accruals
    receivable: number       // accrued, unpaid
    waived: number
    nextQuarterEstimate: number | null
  }
  /** Fee income received minus actual spend, year to date. */
  operatingResult: number
}

export interface StudioProjectFull {
  id: string
  fund_id: string
  name: string
  one_liner: string | null
  sector: string | null
  lead_eir: string | null
  stage: StudioStage
  budget_amount: number | null
  spent_amount: number
  started_at: string | null
  stage_history: { stage: StudioStage; at: string; by: string | null }[]
  company_id: string | null
  investment_id: string | null
  spun_out_at: string | null
  notes: string | null
  created_at: string
}

// ── schema-drift guard ──────────────────────────────────────────────────

let probe: Promise<boolean> | null = null
export function hasMcTables(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const rows = await sql`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('mc_budget_lines', 'mc_actuals', 'studio_projects')`
        return rows.length === 3
      } catch { return false }
    })()
  }
  return probe
}

// ── budget + actuals ────────────────────────────────────────────────────

const num = (v: any) => Number(v) || 0
const d = (v: any): string | null =>
  v == null ? null : typeof v === "string" ? v.slice(0, 10) : new Date(v).toISOString().slice(0, 10)

export async function listBudget(fundId: string, year: number): Promise<BudgetLine[]> {
  if (!(await hasMcTables())) return []
  const rows = await sql`
    SELECT * FROM mc_budget_lines WHERE fund_id = ${fundId} AND year = ${year}
     ORDER BY category ASC`
  return rows.map((r: any) => ({
    id: r.id, fund_id: r.fund_id, year: Number(r.year), category: r.category,
    planned_amount: num(r.planned_amount), notes: r.notes ?? null,
  }))
}

export async function upsertBudgetLine(input: {
  fundId: string; year: number; category: string; plannedAmount: number; notes?: string | null
}): Promise<void> {
  await sql`
    INSERT INTO mc_budget_lines (fund_id, year, category, planned_amount, notes, updated_at)
    VALUES (${input.fundId}, ${input.year}, ${input.category},
            ${Math.max(0, input.plannedAmount)}, ${input.notes ?? null}, NOW())
    ON CONFLICT (fund_id, year, category) DO UPDATE SET
      planned_amount = EXCLUDED.planned_amount,
      notes = EXCLUDED.notes,
      updated_at = NOW()`
}

export async function listActuals(fundId: string, year: number): Promise<McActual[]> {
  if (!(await hasMcTables())) return []
  const rows = await sql`
    SELECT * FROM mc_actuals
     WHERE fund_id = ${fundId}
       AND EXTRACT(YEAR FROM occurred_on) = ${year}
     ORDER BY occurred_on DESC`
  return rows.map((r: any) => ({
    id: r.id, fund_id: r.fund_id, occurred_on: d(r.occurred_on)!,
    category: r.category, amount: num(r.amount), memo: r.memo ?? null,
  }))
}

export async function addActual(input: {
  fundId: string; occurredOn: string; category: string; amount: number;
  memo?: string | null; createdBy?: string | null
}): Promise<void> {
  await sql`
    INSERT INTO mc_actuals (fund_id, occurred_on, category, amount, memo, created_by)
    VALUES (${input.fundId}, ${input.occurredOn}, ${input.category},
            ${input.amount}, ${input.memo ?? null}, ${input.createdBy ?? null})`
}

export async function deleteActual(id: string, fundId: string): Promise<boolean> {
  const rows = await sql`
    DELETE FROM mc_actuals WHERE id = ${id} AND fund_id = ${fundId} RETURNING id`
  return rows.length > 0
}

// ── overview (variance + fee income) ────────────────────────────────────

export async function getMcOverview(fundId: string, year: number): Promise<McOverview | null> {
  if (!(await hasMcTables())) return null
  const [budget, actuals] = await Promise.all([
    listBudget(fundId, year), listActuals(fundId, year),
  ])

  const actualByCat = new Map<string, number>()
  for (const a of actuals) {
    actualByCat.set(a.category, (actualByCat.get(a.category) ?? 0) + a.amount)
  }
  const plannedByCat = new Map(budget.map((b) => [b.category, b.planned_amount]))
  const categories = [...new Set([...MC_CATEGORIES, ...actualByCat.keys(), ...plannedByCat.keys()])]

  const rows: VarianceRow[] = categories.map((category) => {
    const planned = plannedByCat.get(category) ?? 0
    const actual = actualByCat.get(category) ?? 0
    return {
      category, planned, actual,
      variance: Math.round((planned - actual) * 100) / 100,
      pctUsed: planned > 0 ? actual / planned : null,
    }
  }).filter((r) => r.planned !== 0 || r.actual !== 0 || (MC_CATEGORIES as readonly string[]).includes(r.category))

  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0)
  const totalActual = rows.reduce((s, r) => s + r.actual, 0)

  // Fee income from Phase-4 accruals for this year.
  let received = 0, receivable = 0, waived = 0
  let nextQuarterEstimate: number | null = null
  try {
    const acc = await sql`
      SELECT status, fee_amount, period_end FROM fee_accruals
       WHERE fund_id = ${fundId}
         AND EXTRACT(YEAR FROM period_end) = ${year}
       ORDER BY period_end ASC`
    for (const a of acc as any[]) {
      if (a.status === "paid") received += num(a.fee_amount)
      else if (a.status === "waived") waived += num(a.fee_amount)
      else receivable += num(a.fee_amount)
    }
    const last = (acc as any[])[acc.length - 1]
    if (last) nextQuarterEstimate = num(last.fee_amount)
  } catch { /* fee tables absent */ }

  return {
    year,
    rows,
    totalPlanned: Math.round(totalPlanned * 100) / 100,
    totalActual: Math.round(totalActual * 100) / 100,
    totalVariance: Math.round((totalPlanned - totalActual) * 100) / 100,
    feeIncome: { received, receivable, waived, nextQuarterEstimate },
    operatingResult: Math.round((received - totalActual) * 100) / 100,
  }
}

// ── studio projects ─────────────────────────────────────────────────────

function normalizeProject(r: any): StudioProjectFull {
  return {
    id: r.id, fund_id: r.fund_id, name: r.name,
    one_liner: r.one_liner ?? null, sector: r.sector ?? null,
    lead_eir: r.lead_eir ?? null, stage: r.stage,
    budget_amount: r.budget_amount == null ? null : num(r.budget_amount),
    spent_amount: num(r.spent_amount),
    started_at: d(r.started_at),
    stage_history: Array.isArray(r.stage_history) ? r.stage_history : [],
    company_id: r.company_id ?? null,
    investment_id: r.investment_id ?? null,
    spun_out_at: r.spun_out_at ? String(r.spun_out_at) : null,
    notes: r.notes ?? null,
    created_at: String(r.created_at),
  }
}

export async function listProjects(fundId: string): Promise<StudioProjectFull[]> {
  if (!(await hasMcTables())) return []
  const rows = await sql`
    SELECT * FROM studio_projects WHERE fund_id = ${fundId}
     ORDER BY updated_at DESC`
  return rows.map(normalizeProject)
}

export async function getProjectById(id: string): Promise<StudioProjectFull | null> {
  if (!(await hasMcTables())) return null
  const rows = await sql`SELECT * FROM studio_projects WHERE id = ${id} LIMIT 1`
  return rows[0] ? normalizeProject(rows[0]) : null
}

export async function createProject(input: {
  fundId: string; name: string; oneLiner?: string | null; sector?: string | null;
  leadEir?: string | null; budgetAmount?: number | null; startedAt?: string | null;
  notes?: string | null; createdBy?: string | null
}): Promise<StudioProjectFull> {
  const history = [{ stage: "idea", at: new Date().toISOString(), by: input.createdBy ?? null }]
  const rows = await sql`
    INSERT INTO studio_projects (
      fund_id, name, one_liner, sector, lead_eir, budget_amount, started_at, notes, stage_history
    ) VALUES (
      ${input.fundId}, ${input.name.trim()}, ${input.oneLiner ?? null},
      ${input.sector ?? null}, ${input.leadEir ?? null},
      ${input.budgetAmount ?? null}, ${input.startedAt ?? null},
      ${input.notes ?? null}, ${JSON.stringify(history)}::jsonb
    ) RETURNING *`
  return normalizeProject(rows[0])
}

export class StudioError extends Error {
  constructor(msg: string, public readonly code: string) { super(msg); this.name = "StudioError" }
}

export async function transitionProject(
  id: string, to: StudioStage, by: string | null,
): Promise<StudioProjectFull> {
  const p = await getProjectById(id)
  if (!p) throw new StudioError("Project not found", "not_found")
  if (to === "spun_out") {
    throw new StudioError("Use spinoutProject() — spinning out writes the fund of record.", "use_spinout")
  }
  if (!STUDIO_NEXT[p.stage]?.includes(to)) {
    throw new StudioError(`Cannot move ${p.stage} → ${to}`, "invalid_transition")
  }
  const history = [...p.stage_history, { stage: to, at: new Date().toISOString(), by }]
  const rows = await sql`
    UPDATE studio_projects SET
      stage = ${to},
      stage_history = ${JSON.stringify(history)}::jsonb,
      updated_at = NOW()
    WHERE id = ${id} RETURNING *`
  return normalizeProject(rows[0])
}

export async function updateProjectSpend(id: string, spentAmount: number): Promise<StudioProjectFull | null> {
  const rows = await sql`
    UPDATE studio_projects SET
      spent_amount = ${Math.max(0, spentAmount)}, updated_at = NOW()
    WHERE id = ${id} RETURNING *`
  return rows[0] ? normalizeProject(rows[0]) : null
}

export interface SpinoutInput {
  projectId: string
  /** The fund's first check into the NewCo. */
  checkAmount: number
  /** Studio common ownership at formation (fraction, e.g. 0.30). */
  studioCommonPct: number
  investedAt?: string | null
  by?: string | null
}

/**
 * The studio's close action (design §3.5): creates the portfolio company,
 * books the fund's check as an investment (seeded at cost), records the
 * studio common stake as a second zero-cost studio_common investment,
 * and flips the project to spun_out with everything linked.
 */
export async function spinoutProject(input: SpinoutInput): Promise<StudioProjectFull> {
  const p = await getProjectById(input.projectId)
  if (!p) throw new StudioError("Project not found", "not_found")
  if (p.stage !== "build") {
    throw new StudioError(`Only projects in build can spin out (current: ${p.stage}).`, "invalid_transition")
  }
  const check = Number(input.checkAmount)
  if (!Number.isFinite(check) || check <= 0) {
    throw new StudioError("checkAmount must be a positive number.", "missing_check")
  }
  const fund = await getFundById(p.fund_id)
  if (!fund) throw new StudioError("Fund not found", "not_found")

  const investedAt = input.investedAt ?? new Date().toISOString().slice(0, 10)

  // 1. Portfolio company (portfolio_companies.fund_id stores the SLUG).
  const company = await createCompany({
    fundId: fund.slug,
    name: p.name,
    oneLiner: p.one_liner,
    sector: p.sector,
    stage: "studio",
    firstCheckAt: investedAt,
    firstCheckAmount: check,
    metadata: { origin: "studio", studio_project_id: p.id },
  })

  // 2. Fund check → investments spine (seeded at cost).
  const investment = await createInvestment({
    fundId: p.fund_id,
    companyId: company.id,
    companyName: p.name,
    investmentKind: "initial",
    securityType: "preferred",
    roundName: "Studio formation",
    investedAt,
    costBasis: check,
    notes: `Studio spinout of project ${p.id}.`,
    seedValuationAtCost: true,
    createdBy: input.by ?? null,
  })

  // 3. Studio common stake — zero cost, carries the FD%.
  await createInvestment({
    fundId: p.fund_id,
    companyId: company.id,
    companyName: p.name,
    investmentKind: "studio_common",
    securityType: "common",
    roundName: "Studio common",
    investedAt,
    costBasis: 0,
    fullyDilutedPct: Math.min(1, Math.max(0, Number(input.studioCommonPct) || 0)),
    notes: `Studio common stake at formation (project ${p.id}).`,
    seedValuationAtCost: true,
    createdBy: input.by ?? null,
  })

  // 4. Flip the project.
  const history = [...p.stage_history, { stage: "spun_out" as StudioStage, at: new Date().toISOString(), by: input.by ?? null }]
  const rows = await sql`
    UPDATE studio_projects SET
      stage = 'spun_out',
      company_id = ${company.id},
      investment_id = ${investment.id},
      spun_out_at = NOW(),
      stage_history = ${JSON.stringify(history)}::jsonb,
      updated_at = NOW()
    WHERE id = ${input.projectId} RETURNING *`
  return normalizeProject(rows[0])
}
