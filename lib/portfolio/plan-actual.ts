/**
 * Plan vs. actual — Phase 7 of FUND_OPS_DESIGN.md (§3.4 "the calculators
 * grow up"). No new tables:
 *
 *   PLAN    the VC Fund Model tool's inputs (lib/tools/vc-fund-model is a
 *           pure function) saved into funds.metadata.plan. Saving a plan
 *           and re-running compute() is deterministic, so the plan rows
 *           are always derivable — nothing to keep in sync.
 *
 *   ACTUAL  read from the record: paid capital-call lines (called),
 *           investments cost by year split initial vs follow-on
 *           (deployed), paid distribution lines (distributed), and the
 *           Phase-1 NAV for the current mark.
 *
 * The reserve check is the piece the deal pipeline uses at allocation
 * time (§3.1): plan.reserveRatio × fundSize is the follow-on budget;
 * what's left of the initial-check budget bounds any new deal's check.
 */

import { sql } from "@/lib/db"
import { getFundById, updateFund } from "@/lib/portfolio/funds"
import { getFundNav } from "@/lib/portfolio/investments"
import { compute, type VcFundModelInputs } from "@/lib/tools/vc-fund-model"

// ── types ───────────────────────────────────────────────────────────────

export interface PlanYearRow {
  year: number                     // fund year, 1-indexed
  calendarYear: number
  plan: { called: number; deployed: number; distributed: number; nav: number }
  actual: { called: number; deployedInitial: number; deployedFollowOn: number; distributed: number }
  /** Cumulative actual deployed ÷ cumulative plan deployed (pacing). */
  pacingPct: number | null
}

export interface ReserveStatus {
  fundSize: number
  reserveRatio: number
  initialBudget: number            // fundSize × (1 - reserveRatio)
  reserveBudget: number            // fundSize × reserveRatio
  initialUsed: number              // Σ cost of initial/secondary/bridge/other positions
  followOnUsed: number             // Σ cost of follow_on positions
  remainingInitial: number
  remainingReserve: number
  /** Committed-but-not-closed pipeline checks (deals at committed stage). */
  committedPipeline: number
  /** remainingInitial - committedPipeline: what's truly free for new deals. */
  uncommittedInitial: number
}

export interface PlanVsActual {
  hasPlan: boolean
  plan: VcFundModelInputs | null
  startYear: number
  rows: PlanYearRow[]
  reserve: ReserveStatus | null
  headline: {
    planTvpi: number | null
    currentTvpiOnPlanTimeline: number | null   // plan TVPI at the current fund year
    actualNav: number | null
    actualCalled: number
    actualDeployed: number
    actualDistributed: number
    currentFundYear: number
  }
  notes: string[]
}

// ── plan storage (funds.metadata.plan) ──────────────────────────────────

export async function getPlan(fundId: string): Promise<VcFundModelInputs | null> {
  const fund = await getFundById(fundId)
  const plan = fund?.metadata?.plan
  return plan && typeof plan === "object" ? (plan as VcFundModelInputs) : null
}

export async function savePlan(fundId: string, plan: VcFundModelInputs): Promise<void> {
  const fund = await getFundById(fundId)
  if (!fund) throw new Error("Fund not found")
  await updateFund(fundId, {
    metadata: { ...fund.metadata, plan, plan_saved_at: new Date().toISOString() },
  })
}

// ── actuals from the record ─────────────────────────────────────────────

interface YearBuckets {
  called: Map<number, number>
  deployedInitial: Map<number, number>
  deployedFollowOn: Map<number, number>
  distributed: Map<number, number>
  firstYear: number | null
}

const yearOf = (v: any): number | null => {
  if (v == null) return null
  const y = new Date(v).getUTCFullYear()
  return Number.isFinite(y) && y > 1990 ? y : null
}

async function collectActuals(fundId: string): Promise<YearBuckets> {
  const b: YearBuckets = {
    called: new Map(), deployedInitial: new Map(),
    deployedFollowOn: new Map(), distributed: new Map(), firstYear: null,
  }
  const bump = (m: Map<number, number>, y: number | null, amt: number) => {
    if (y == null || !amt) return
    m.set(y, (m.get(y) ?? 0) + amt)
    b.firstYear = b.firstYear == null ? y : Math.min(b.firstYear, y)
  }
  try {
    const rows = await sql`
      SELECT cli.amount, COALESCE(cli.paid_at, cc.sent_at, cc.created_at) AS at
        FROM capital_call_line_items cli
        JOIN capital_calls cc ON cc.id = cli.call_id
       WHERE cc.fund_id = ${fundId} AND cli.status = 'paid'`
    for (const r of rows as any[]) bump(b.called, yearOf(r.at), Number(r.amount) || 0)
  } catch { /* absent */ }
  try {
    const rows = await sql`
      SELECT cost_basis, investment_kind, COALESCE(invested_at, created_at) AS at
        FROM investments WHERE fund_id = ${fundId}`
    for (const r of rows as any[]) {
      const amt = Number(r.cost_basis) || 0
      if (r.investment_kind === "follow_on") bump(b.deployedFollowOn, yearOf(r.at), amt)
      else bump(b.deployedInitial, yearOf(r.at), amt)
    }
  } catch { /* absent */ }
  try {
    const rows = await sql`
      SELECT dli.amount, COALESCE(dli.paid_at, d.created_at) AS at
        FROM distribution_line_items dli
        JOIN distributions d ON d.id = dli.distribution_id
       WHERE d.fund_id = ${fundId} AND dli.status = 'paid'`
    for (const r of rows as any[]) bump(b.distributed, yearOf(r.at), Number(r.amount) || 0)
  } catch { /* absent */ }
  return b
}

// ── reserve status ──────────────────────────────────────────────────────

export async function getReserveStatus(fundId: string): Promise<ReserveStatus | null> {
  const plan = await getPlan(fundId)
  if (!plan) return null
  const fundSize = Number(plan.fundSizeUsd) || 0
  const reserveRatio = Math.min(0.9, Math.max(0, Number(plan.reserveRatio ?? 0.4)))
  const initialBudget = fundSize * (1 - reserveRatio)
  const reserveBudget = fundSize * reserveRatio

  let initialUsed = 0, followOnUsed = 0
  try {
    const rows = await sql`
      SELECT investment_kind, COALESCE(SUM(cost_basis), 0) AS v
        FROM investments WHERE fund_id = ${fundId}
       GROUP BY investment_kind`
    for (const r of rows as any[]) {
      if (r.investment_kind === "follow_on") followOnUsed += Number(r.v) || 0
      else initialUsed += Number(r.v) || 0
    }
  } catch { /* absent */ }

  let committedPipeline = 0
  try {
    const rows = await sql`
      SELECT COALESCE(SUM(proposed_check), 0) AS v
        FROM deal_opportunities
       WHERE fund_id = ${fundId} AND stage = 'committed'` as any[]
    committedPipeline = Number(rows[0]?.v) || 0
  } catch { /* absent */ }

  const remainingInitial = Math.round((initialBudget - initialUsed) * 100) / 100
  return {
    fundSize, reserveRatio, initialBudget, reserveBudget,
    initialUsed: Math.round(initialUsed * 100) / 100,
    followOnUsed: Math.round(followOnUsed * 100) / 100,
    remainingInitial,
    remainingReserve: Math.round((reserveBudget - followOnUsed) * 100) / 100,
    committedPipeline,
    uncommittedInitial: Math.round((remainingInitial - committedPipeline) * 100) / 100,
  }
}

// ── plan vs actual ──────────────────────────────────────────────────────

export async function getPlanVsActual(fundId: string): Promise<PlanVsActual> {
  const fund = await getFundById(fundId)
  const plan = await getPlan(fundId)
  const [actuals, nav, reserve] = await Promise.all([
    collectActuals(fundId), getFundNav(fundId), getReserveStatus(fundId),
  ])

  const notes: string[] = []
  const nowYear = new Date().getUTCFullYear()
  const startYear = fund?.vintage_year ?? actuals.firstYear ?? nowYear
  const currentFundYear = Math.max(1, nowYear - startYear + 1)

  if (!plan) {
    return {
      hasPlan: false, plan: null, startYear, rows: [], reserve: null,
      headline: {
        planTvpi: null, currentTvpiOnPlanTimeline: null,
        actualNav: nav?.positionsFairValue ?? null,
        actualCalled: [...actuals.called.values()].reduce((s, v) => s + v, 0),
        actualDeployed: [...actuals.deployedInitial.values(), ...actuals.deployedFollowOn.values()].reduce((s, v) => s + v, 0),
        actualDistributed: [...actuals.distributed.values()].reduce((s, v) => s + v, 0),
        currentFundYear,
      },
      notes: ["No plan saved yet — set the fund model assumptions below to unlock pacing and reserve checks."],
    }
  }

  // Deterministic plan projection from the saved inputs.
  const model = compute(plan)
  const years = model.rows.length

  let cumPlanDeployed = 0
  let cumActualDeployed = 0
  const rows: PlanYearRow[] = model.rows.map((p) => {
    const calendarYear = startYear + p.year - 1
    const aCalled = actuals.called.get(calendarYear) ?? 0
    const aInit = actuals.deployedInitial.get(calendarYear) ?? 0
    const aFoll = actuals.deployedFollowOn.get(calendarYear) ?? 0
    const aDist = actuals.distributed.get(calendarYear) ?? 0
    cumPlanDeployed += p.capitalInvested + p.followOnInvested
    cumActualDeployed += aInit + aFoll
    const isPastOrCurrent = calendarYear <= nowYear
    return {
      year: p.year,
      calendarYear,
      plan: {
        called: Math.round(p.capitalCalled),
        deployed: Math.round(p.capitalInvested + p.followOnInvested),
        distributed: Math.round(p.exitsCash),
        nav: Math.round(p.unrealizedNav),
      },
      actual: {
        called: Math.round(aCalled),
        deployedInitial: Math.round(aInit),
        deployedFollowOn: Math.round(aFoll),
        distributed: Math.round(aDist),
      },
      pacingPct: isPastOrCurrent && cumPlanDeployed > 0
        ? Math.round((cumActualDeployed / cumPlanDeployed) * 1000) / 10
        : null,
    }
  })

  const currentRow = rows.find((r) => r.calendarYear === nowYear)
  if (currentRow?.pacingPct != null) {
    if (currentRow.pacingPct < 60) notes.push(`Deployment pacing at ${currentRow.pacingPct}% of plan — under-deployed vs. the model.`)
    if (currentRow.pacingPct > 140) notes.push(`Deployment pacing at ${currentRow.pacingPct}% of plan — ahead of the model; check reserve coverage.`)
  }
  if (reserve && reserve.uncommittedInitial < 0) {
    notes.push("Committed pipeline exceeds the remaining initial-check budget — closing everything would breach the plan's reserve policy.")
  }
  if (nav && nav.markedPositionCount === 0 && nav.activePositionCount > 0) {
    notes.push("Positions are carried at cost (no marks yet) — actual NAV understates any markups.")
  }

  const planYearIdx = Math.min(currentFundYear, years) - 1
  return {
    hasPlan: true,
    plan,
    startYear,
    rows,
    reserve,
    headline: {
      planTvpi: model.finalTvpi,
      currentTvpiOnPlanTimeline: model.rows[planYearIdx]?.tvpi ?? null,
      actualNav: nav?.positionsFairValue ?? null,
      actualCalled: [...actuals.called.values()].reduce((s, v) => s + v, 0),
      actualDeployed: cumActualDeployed,
      actualDistributed: [...actuals.distributed.values()].reduce((s, v) => s + v, 0),
      currentFundYear,
    },
    notes,
  }
}

/**
 * Reserve check for a proposed check size — used by the deal workroom at
 * allocation/close time (design §3.1). Returns null when no plan exists
 * (nothing to check against).
 */
export async function checkProposedAllocation(
  fundId: string,
  proposedCheck: number,
): Promise<{ fits: boolean; reserve: ReserveStatus; message: string } | null> {
  const reserve = await getReserveStatus(fundId)
  if (!reserve) return null
  const fits = proposedCheck <= reserve.uncommittedInitial
  const fmt = (n: number) => `$${Math.round(n).toLocaleString()}`
  return {
    fits,
    reserve,
    message: fits
      ? `Fits: ${fmt(proposedCheck)} ≤ ${fmt(reserve.uncommittedInitial)} uncommitted initial budget.`
      : `Over budget: ${fmt(proposedCheck)} exceeds the ${fmt(reserve.uncommittedInitial)} uncommitted initial budget (plan reserve ${(reserve.reserveRatio * 100).toFixed(0)}%).`,
  }
}
