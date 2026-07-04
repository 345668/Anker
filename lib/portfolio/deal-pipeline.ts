/**
 * Deal pipeline — GP deal flow, sourcing through close (Phase 2 of
 * FUND_OPS_DESIGN.md §3.1).
 *
 * The lifecycle is an enforced state machine:
 *
 *   sourced → screened → deep_dive → ic_scheduled → ic_approved
 *           → term_sheet → committed → closed          (forward path)
 *   any non-terminal stage → passed                    (with a reason)
 *
 * Every transition appends {stage, at, by} to stage_history — the audit
 * trail lives on the row.
 *
 * The four verbs beyond CRUD:
 *   - upsertEvaluation(): weighted scorecard against DEAL_CRITERIA.
 *   - castVote(): one vote per IC member per deal (upsert); tallyVotes()
 *     summarises approve/decline/conditions.
 *   - addTermGrid(): versioned term proposals; latest version wins.
 *   - closeDeal(): THE moment pipeline becomes fund-of-record — creates
 *     an investments row (seeded at cost, Phase 1 spine), links it back,
 *     stamps closed. Atomicity note: Neon HTTP has no transactions, so
 *     we create the investment first and only then flip the deal; a
 *     crash in between leaves an investment without a closed deal,
 *     which is visible and fixable, never silent data loss.
 *
 * The AI memo follows the platform's frozen-context pattern
 * (lp-quarterly-report.ts): memo_context stores exactly what the model
 * saw, so re-reading the memo years later shows its true basis.
 */

import { sql } from "@/lib/db"
import { generate } from "@/lib/ai/provider"
import { createInvestment, type InvestmentFull, type SecurityType } from "@/lib/portfolio/investments"
import { listFounders, createFounder } from "./deal-founders"
import { listDocuments } from "./deal-documents"
import { evaluateGate, canRegress, type GateContext } from "./deal-stage-gates"

// Pure constants & scoring helpers live in ./deal-constants (no DB imports) so
// client components can import them without dragging `pg` into the browser
// bundle. Re-exported here so existing server importers keep working.
export {
  DEAL_STAGES, canTransition, DEAL_CRITERIA, weightedScore,
  type DealStage, type DealCriterion, type ScoreMap,
} from "./deal-constants"
import { DEAL_STAGES, DEAL_CRITERIA, canTransition, weightedScore } from "./deal-constants"
import type { DealStage, ScoreMap } from "./deal-constants"

// ── types ───────────────────────────────────────────────────────────────

export interface StageEvent { stage: DealStage; at: string; by: string | null }

export interface DealFull {
  id: string
  fund_id: string
  company_name: string
  website: string | null
  one_liner: string | null
  sector: string | null
  geography: string | null
  round_name: string | null
  raise_amount: number | null
  pre_money: number | null
  proposed_check: number | null
  source: string | null
  owner_email: string | null
  stage: DealStage
  passed_reason: string | null
  stage_history: StageEvent[]
  deck_url: string | null
  contact_name: string | null
  contact_email: string | null
  submitted_via: "internal" | "public_form"
  memo_md: string | null
  memo_generated_at: string | null
  memo_model: string | null
  investment_id: string | null
  closed_at: string | null
  notes: string | null
  metadata: Record<string, any>
  created_at: string
  updated_at: string
}

export interface DealEvaluation {
  deal_id: string
  scores: ScoreMap
  weighted_score: number | null
  summary: string | null
  evaluated_by: string | null
  updated_at: string
}

export type IcVoteValue = "approve" | "approve_with_conditions" | "decline" | "abstain"

export interface IcVote {
  id: string
  deal_id: string
  member: string
  vote: IcVoteValue
  conditions: string | null
  note: string | null
  created_at: string
}

export interface VoteTally {
  approve: number
  approveWithConditions: number
  decline: number
  abstain: number
  total: number
}

export interface TermGrid {
  id: string
  deal_id: string
  version: number
  security_type: string | null
  pre_money: number | null
  round_size: number | null
  check_amount: number | null
  pro_rata: boolean | null
  board_seat: string | null
  liquidation_pref: string | null
  other_terms: string | null
  created_by: string | null
  created_at: string
}

// ── schema-drift guard ──────────────────────────────────────────────────

let probe: Promise<boolean> | null = null
export function hasDealTables(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const rows = await sql`
          SELECT table_name FROM information_schema.tables
           WHERE table_schema = 'public'
             AND table_name IN ('deal_opportunities', 'deal_evaluations', 'ic_votes', 'term_grids')`
        return rows.length === 4
      } catch { return false }
    })()
  }
  return probe
}

// ── normalize ───────────────────────────────────────────────────────────

const numOrNull = (v: any): number | null => (v == null ? null : Number(v))

function normalizeDeal(r: any): DealFull {
  return {
    id: r.id,
    fund_id: r.fund_id,
    company_name: r.company_name,
    website: r.website ?? null,
    one_liner: r.one_liner ?? null,
    sector: r.sector ?? null,
    geography: r.geography ?? null,
    round_name: r.round_name ?? null,
    raise_amount: numOrNull(r.raise_amount),
    pre_money: numOrNull(r.pre_money),
    proposed_check: numOrNull(r.proposed_check),
    source: r.source ?? null,
    owner_email: r.owner_email ?? null,
    stage: r.stage,
    passed_reason: r.passed_reason ?? null,
    stage_history: Array.isArray(r.stage_history) ? r.stage_history : [],
    deck_url: r.deck_url ?? null,
    contact_name: r.contact_name ?? null,
    contact_email: r.contact_email ?? null,
    submitted_via: r.submitted_via ?? "internal",
    memo_md: r.memo_md ?? null,
    memo_generated_at: r.memo_generated_at ? String(r.memo_generated_at) : null,
    memo_model: r.memo_model ?? null,
    investment_id: r.investment_id ?? null,
    closed_at: r.closed_at ? String(r.closed_at) : null,
    notes: r.notes ?? null,
    metadata: r.metadata ?? {},
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }
}

// ── deals: read ─────────────────────────────────────────────────────────

export async function listDeals(fundId: string): Promise<DealFull[]> {
  if (!(await hasDealTables())) return []
  const rows = await sql`
    SELECT * FROM deal_opportunities
     WHERE fund_id = ${fundId}
     ORDER BY updated_at DESC`
  return rows.map(normalizeDeal)
}

export async function getDealById(id: string): Promise<DealFull | null> {
  if (!(await hasDealTables())) return null
  const rows = await sql`SELECT * FROM deal_opportunities WHERE id = ${id} LIMIT 1`
  return rows[0] ? normalizeDeal(rows[0]) : null
}

// ── deals: write ────────────────────────────────────────────────────────

export interface CreateDealInput {
  fundId: string
  companyName: string
  website?: string | null
  oneLiner?: string | null
  sector?: string | null
  geography?: string | null
  roundName?: string | null
  raiseAmount?: number | null
  preMoney?: number | null
  proposedCheck?: number | null
  source?: string | null
  ownerEmail?: string | null
  notes?: string | null
  deckUrl?: string | null
  contactName?: string | null
  contactEmail?: string | null
  submittedVia?: "internal" | "public_form"
  createdBy?: string | null
}

export async function createDeal(input: CreateDealInput): Promise<DealFull> {
  const history: StageEvent[] = [
    { stage: "sourced", at: new Date().toISOString(), by: input.createdBy ?? null },
  ]
  const rows = await sql`
    INSERT INTO deal_opportunities (
      fund_id, company_name, website, one_liner, sector, geography,
      round_name, raise_amount, pre_money, proposed_check, source,
      owner_email, notes, deck_url, contact_name, contact_email,
      submitted_via, stage_history
    ) VALUES (
      ${input.fundId}, ${input.companyName.trim()}, ${input.website ?? null},
      ${input.oneLiner ?? null}, ${input.sector ?? null}, ${input.geography ?? null},
      ${input.roundName ?? null}, ${input.raiseAmount ?? null}, ${input.preMoney ?? null},
      ${input.proposedCheck ?? null}, ${input.source ?? null},
      ${input.ownerEmail ?? null}, ${input.notes ?? null},
      ${input.deckUrl ?? null}, ${input.contactName ?? null}, ${input.contactEmail ?? null},
      ${input.submittedVia ?? "internal"},
      ${JSON.stringify(history)}::jsonb
    ) RETURNING *`
  const deal = normalizeDeal(rows[0])
  // Auto-seed the primary founder from the pitch contact when present, so the
  // founder profile section (and the sourced-stage gate) start populated.
  if (input.contactName && input.contactName.trim()) {
    try {
      await createFounder({
        dealId: deal.id,
        name: input.contactName.trim(),
        email: input.contactEmail ?? null,
        isPrimary: true,
      })
    } catch (err) {
      console.log("[deal-pipeline] founder auto-seed skipped:", (err as Error).message)
    }
  }
  return deal
}

export interface UpdateDealInput {
  companyName?: string
  website?: string | null
  oneLiner?: string | null
  sector?: string | null
  geography?: string | null
  roundName?: string | null
  raiseAmount?: number | null
  preMoney?: number | null
  proposedCheck?: number | null
  source?: string | null
  ownerEmail?: string | null
  notes?: string | null
}

export async function updateDeal(id: string, patch: UpdateDealInput): Promise<DealFull | null> {
  const d = await getDealById(id)
  if (!d) return null
  const rows = await sql`
    UPDATE deal_opportunities SET
      company_name   = ${patch.companyName !== undefined ? patch.companyName.trim() : d.company_name},
      website        = ${patch.website !== undefined ? patch.website : d.website},
      one_liner      = ${patch.oneLiner !== undefined ? patch.oneLiner : d.one_liner},
      sector         = ${patch.sector !== undefined ? patch.sector : d.sector},
      geography      = ${patch.geography !== undefined ? patch.geography : d.geography},
      round_name     = ${patch.roundName !== undefined ? patch.roundName : d.round_name},
      raise_amount   = ${patch.raiseAmount !== undefined ? patch.raiseAmount : d.raise_amount},
      pre_money      = ${patch.preMoney !== undefined ? patch.preMoney : d.pre_money},
      proposed_check = ${patch.proposedCheck !== undefined ? patch.proposedCheck : d.proposed_check},
      source         = ${patch.source !== undefined ? patch.source : d.source},
      owner_email    = ${patch.ownerEmail !== undefined ? patch.ownerEmail : d.owner_email},
      notes          = ${patch.notes !== undefined ? patch.notes : d.notes},
      updated_at     = NOW()
    WHERE id = ${id} RETURNING *`
  return rows[0] ? normalizeDeal(rows[0]) : null
}

export class DealTransitionError extends Error {
  constructor(msg: string, public readonly code: string) { super(msg); this.name = "DealTransitionError" }
}

/**
 * Assemble the full gate context for a deal — everything the stage-gate
 * predicates need to decide whether a forward move is allowed.
 */
export async function buildGateContext(deal: DealFull): Promise<GateContext> {
  const [evaluation, tally, terms, founders, documents] = await Promise.all([
    getEvaluation(deal.id),
    tallyVotes(deal.id),
    listTermGrids(deal.id),
    listFounders(deal.id),
    listDocuments(deal.id),
  ])
  return { deal, evaluation, tally, terms, founders, documents }
}

export async function transitionDeal(
  id: string,
  to: DealStage,
  by: string | null,
  passedReason?: string | null,
): Promise<DealFull> {
  const d = await getDealById(id)
  if (!d) throw new DealTransitionError("Deal not found", "not_found")
  if (!canTransition(d.stage, to)) {
    throw new DealTransitionError(`Cannot move ${d.stage} → ${to}`, "invalid_transition")
  }
  if (to === "closed") {
    throw new DealTransitionError("Use closeDeal() — closing writes the investment record.", "use_close")
  }
  // Hard gate: every forward move (except passing a deal, which is always
  // allowed) must satisfy the requirements for advancing OUT of the current
  // stage. Passing is an escape hatch and is never gated.
  if (to !== "passed") {
    const ctx = await buildGateContext(d)
    const results = evaluateGate(d.stage, ctx)
    const missing = results.filter((r) => !r.ok)
    if (missing.length > 0) {
      throw new DealTransitionError(
        `Cannot advance from "${d.stage}" — complete: ${missing.map((m) => m.label).join(", ")}.`,
        "gate_incomplete",
      )
    }
  }
  const history = [...d.stage_history, { stage: to, at: new Date().toISOString(), by }]
  const rows = await sql`
    UPDATE deal_opportunities SET
      stage         = ${to},
      passed_reason = ${to === "passed" ? (passedReason ?? null) : d.passed_reason},
      stage_history = ${JSON.stringify(history)}::jsonb,
      updated_at    = NOW()
    WHERE id = ${id} RETURNING *`
  return normalizeDeal(rows[0])
}

/**
 * Move a deal BACK to an earlier active stage. Ungated (backward moves are
 * always allowed to correct course), but recorded in stage_history with a
 * note. `passed` deals can be regressed to any active stage here; `closed`
 * deals must use reopenDeal() because of the linked investment.
 */
export async function regressDeal(
  id: string,
  to: DealStage,
  by: string | null,
  note?: string | null,
): Promise<DealFull> {
  const d = await getDealById(id)
  if (!d) throw new DealTransitionError("Deal not found", "not_found")
  if (d.stage === "closed") {
    throw new DealTransitionError("Use reopenDeal() — closed deals have a linked investment.", "use_reopen")
  }
  if (!canRegress(d.stage, to)) {
    throw new DealTransitionError(`Cannot move ${d.stage} back to ${to}.`, "invalid_regress")
  }
  const event: any = { stage: to, at: new Date().toISOString(), by, note: note ?? "moved back" }
  const history = [...d.stage_history, event]
  const rows = await sql`
    UPDATE deal_opportunities SET
      stage         = ${to},
      passed_reason = ${null},
      stage_history = ${JSON.stringify(history)}::jsonb,
      updated_at    = NOW()
    WHERE id = ${id} RETURNING *`
  return normalizeDeal(rows[0])
}

export interface ReopenDealInput {
  dealId: string
  to: DealStage
  by?: string | null
  note?: string | null
  /** When true, detach the linked investment (documented, reversible). */
  unwindInvestment?: boolean
}

export interface ReopenDealResult {
  deal: DealFull
  warning: string | null
}

/**
 * Reopen a closed (or passed) deal back to an active stage. Closing created an
 * investment row; by default we KEEP it and just record a reopen event,
 * returning a warning so the caller can surface it. When `unwindInvestment` is
 * set we detach the investment link from the deal (the investment row itself is
 * preserved for audit — nothing is silently destroyed).
 */
export async function reopenDeal(input: ReopenDealInput): Promise<ReopenDealResult> {
  const d = await getDealById(input.dealId)
  if (!d) throw new DealTransitionError("Deal not found", "not_found")
  if (d.stage !== "closed" && d.stage !== "passed") {
    throw new DealTransitionError("Only closed or passed deals can be reopened.", "not_terminal")
  }
  if (input.to === "closed" || input.to === "passed") {
    throw new DealTransitionError("Reopen target must be an active stage.", "invalid_target")
  }

  let warning: string | null = null
  const detach = d.stage === "closed" && input.unwindInvestment === true
  if (d.stage === "closed" && d.investment_id && !detach) {
    warning = `This deal was closed with a linked investment (${d.investment_id}). ` +
      `Reopening keeps that investment on the fund's books — reconcile manually or reopen with unwind.`
  }
  if (detach) {
    warning = `Investment ${d.investment_id} was detached from this deal. ` +
      `The investment row is preserved for audit and can be re-linked or removed separately.`
  }

  const event: any = {
    stage: input.to, at: new Date().toISOString(), by: input.by ?? null,
    note: input.note ?? (detach ? "reopened (investment detached)" : "reopened"),
  }
  const history = [...d.stage_history, event]
  const rows = await sql`
    UPDATE deal_opportunities SET
      stage         = ${input.to},
      passed_reason = ${null},
      closed_at     = ${null},
      investment_id = ${detach ? null : d.investment_id},
      stage_history = ${JSON.stringify(history)}::jsonb,
      updated_at    = NOW()
    WHERE id = ${input.dealId} RETURNING *`
  return { deal: normalizeDeal(rows[0]), warning }
}

export async function deleteDeal(id: string): Promise<boolean> {
  const rows = await sql`DELETE FROM deal_opportunities WHERE id = ${id} RETURNING id`
  return rows.length > 0
}

// ── evaluation ──────────────────────────────────────────────────────────

export async function getEvaluation(dealId: string): Promise<DealEvaluation | null> {
  if (!(await hasDealTables())) return null
  const rows = await sql`SELECT * FROM deal_evaluations WHERE deal_id = ${dealId} LIMIT 1`
  if (!rows[0]) return null
  const r: any = rows[0]
  return {
    deal_id: r.deal_id,
    scores: r.scores ?? {},
    weighted_score: numOrNull(r.weighted_score),
    summary: r.summary ?? null,
    evaluated_by: r.evaluated_by ?? null,
    updated_at: String(r.updated_at),
  }
}

export async function upsertEvaluation(
  dealId: string,
  scores: ScoreMap,
  summary: string | null,
  evaluatedBy: string | null,
): Promise<DealEvaluation> {
  const ws = weightedScore(scores)
  await sql`
    INSERT INTO deal_evaluations (deal_id, scores, weighted_score, summary, evaluated_by, updated_at)
    VALUES (${dealId}, ${JSON.stringify(scores)}::jsonb, ${ws}, ${summary}, ${evaluatedBy}, NOW())
    ON CONFLICT (deal_id) DO UPDATE SET
      scores = EXCLUDED.scores,
      weighted_score = EXCLUDED.weighted_score,
      summary = EXCLUDED.summary,
      evaluated_by = EXCLUDED.evaluated_by,
      updated_at = NOW()`
  return (await getEvaluation(dealId))!
}

// ── IC votes ────────────────────────────────────────────────────────────

export async function listVotes(dealId: string): Promise<IcVote[]> {
  if (!(await hasDealTables())) return []
  const rows = await sql`
    SELECT * FROM ic_votes WHERE deal_id = ${dealId} ORDER BY created_at ASC`
  return rows.map((r: any) => ({
    id: r.id, deal_id: r.deal_id, member: r.member, vote: r.vote,
    conditions: r.conditions ?? null, note: r.note ?? null,
    created_at: String(r.created_at),
  }))
}

export async function castVote(
  dealId: string,
  member: string,
  vote: IcVoteValue,
  conditions: string | null,
  note: string | null,
): Promise<IcVote[]> {
  await sql`
    INSERT INTO ic_votes (deal_id, member, vote, conditions, note)
    VALUES (${dealId}, ${member.trim()}, ${vote}, ${conditions}, ${note})
    ON CONFLICT (deal_id, member) DO UPDATE SET
      vote = EXCLUDED.vote,
      conditions = EXCLUDED.conditions,
      note = EXCLUDED.note,
      created_at = NOW()`
  return listVotes(dealId)
}

export async function tallyVotes(dealId: string): Promise<VoteTally> {
  const votes = await listVotes(dealId)
  return {
    approve: votes.filter((v) => v.vote === "approve").length,
    approveWithConditions: votes.filter((v) => v.vote === "approve_with_conditions").length,
    decline: votes.filter((v) => v.vote === "decline").length,
    abstain: votes.filter((v) => v.vote === "abstain").length,
    total: votes.length,
  }
}

// ── term grids ──────────────────────────────────────────────────────────

export async function listTermGrids(dealId: string): Promise<TermGrid[]> {
  if (!(await hasDealTables())) return []
  const rows = await sql`
    SELECT * FROM term_grids WHERE deal_id = ${dealId} ORDER BY version DESC`
  return rows.map((r: any) => ({
    id: r.id, deal_id: r.deal_id, version: Number(r.version),
    security_type: r.security_type ?? null,
    pre_money: numOrNull(r.pre_money), round_size: numOrNull(r.round_size),
    check_amount: numOrNull(r.check_amount),
    pro_rata: r.pro_rata ?? null, board_seat: r.board_seat ?? null,
    liquidation_pref: r.liquidation_pref ?? null, other_terms: r.other_terms ?? null,
    created_by: r.created_by ?? null, created_at: String(r.created_at),
  }))
}

export interface AddTermGridInput {
  dealId: string
  securityType?: string | null
  preMoney?: number | null
  roundSize?: number | null
  checkAmount?: number | null
  proRata?: boolean | null
  boardSeat?: string | null
  liquidationPref?: string | null
  otherTerms?: string | null
  createdBy?: string | null
}

export async function addTermGrid(input: AddTermGridInput): Promise<TermGrid[]> {
  const [{ next }] = await sql`
    SELECT COALESCE(MAX(version), 0) + 1 AS next FROM term_grids WHERE deal_id = ${input.dealId}` as any[]
  await sql`
    INSERT INTO term_grids (
      deal_id, version, security_type, pre_money, round_size, check_amount,
      pro_rata, board_seat, liquidation_pref, other_terms, created_by
    ) VALUES (
      ${input.dealId}, ${Number(next)}, ${input.securityType ?? null},
      ${input.preMoney ?? null}, ${input.roundSize ?? null}, ${input.checkAmount ?? null},
      ${input.proRata ?? null}, ${input.boardSeat ?? null},
      ${input.liquidationPref ?? null}, ${input.otherTerms ?? null},
      ${input.createdBy ?? null}
    )`
  return listTermGrids(input.dealId)
}

// ── AI memo ─────────────────────────────────────────────────────────────

export async function generateDealMemo(dealId: string): Promise<DealFull> {
  const deal = await getDealById(dealId)
  if (!deal) throw new Error("Deal not found")
  const [evaluation, votes, terms] = await Promise.all([
    getEvaluation(dealId), listVotes(dealId), listTermGrids(dealId),
  ])

  // Frozen context — exactly what the model sees, stored beside the memo.
  const context = {
    deal: {
      company: deal.company_name, website: deal.website, oneLiner: deal.one_liner,
      sector: deal.sector, geography: deal.geography, round: deal.round_name,
      raiseAmount: deal.raise_amount, preMoney: deal.pre_money,
      proposedCheck: deal.proposed_check, source: deal.source,
      stage: deal.stage, notes: deal.notes,
    },
    evaluation: evaluation
      ? { weightedScore: evaluation.weighted_score, summary: evaluation.summary,
          scores: DEAL_CRITERIA.map((c) => ({
            criterion: c.label, weight: c.weight,
            score: evaluation.scores[c.key]?.score ?? null,
            note: evaluation.scores[c.key]?.note ?? null,
          })) }
      : null,
    icVotes: votes.map((v) => ({ member: v.member, vote: v.vote, conditions: v.conditions, note: v.note })),
    latestTerms: terms[0] ?? null,
    generatedAt: new Date().toISOString(),
  }

  const prompt = [
    `You are the investment team's analyst at a venture fund. Draft an`,
    `investment-committee memo in Markdown for the deal below. Structure:`,
    `## Summary (3 sentences) · ## Company · ## Market · ## Traction &`,
    `evaluation (reference the scorecard) · ## Proposed terms · ## Risks`,
    `(numbered, honest) · ## Recommendation. Be specific and use only the`,
    `facts provided — never invent numbers. Where data is missing, say so.`,
    ``,
    `DEAL DATA (JSON):`,
    JSON.stringify(context, null, 2),
  ].join("\n")

  const t0 = Date.now()
  const memoMd = await generate(prompt, { task: "deep_research", maxTokens: 3000 })
  const rows = await sql`
    UPDATE deal_opportunities SET
      memo_md = ${memoMd},
      memo_context = ${JSON.stringify(context)}::jsonb,
      memo_generated_at = NOW(),
      memo_model = ${"qwen-deep"},
      updated_at = NOW()
    WHERE id = ${dealId} RETURNING *`
  console.log(`[deal-pipeline] memo generated deal=${dealId} in ${Date.now() - t0}ms`)
  return normalizeDeal(rows[0])
}

// ── close ───────────────────────────────────────────────────────────────

export interface CloseDealInput {
  dealId: string
  investedAt?: string | null      // default today
  costBasis?: number | null       // default latest term grid check_amount or proposed_check
  securityType?: SecurityType | null
  fullyDilutedPct?: number | null
  by?: string | null
}

export interface CloseDealResult {
  deal: DealFull
  investment: InvestmentFull
}

export async function closeDeal(input: CloseDealInput): Promise<CloseDealResult> {
  const deal = await getDealById(input.dealId)
  if (!deal) throw new DealTransitionError("Deal not found", "not_found")
  if (deal.stage !== "committed") {
    throw new DealTransitionError(`Only committed deals can close (current: ${deal.stage}).`, "invalid_transition")
  }
  const terms = await listTermGrids(input.dealId)
  const latest = terms[0] ?? null

  const costBasis = input.costBasis ?? latest?.check_amount ?? deal.proposed_check
  if (costBasis == null || !Number.isFinite(Number(costBasis)) || Number(costBasis) <= 0) {
    throw new DealTransitionError(
      "No check amount available — set costBasis, a term grid check, or the proposed check first.",
      "missing_check",
    )
  }
  const securityType: SecurityType =
    (input.securityType as SecurityType) ??
    (latest?.security_type as SecurityType) ?? "preferred"

  // 1. Create the investment (Phase 1 spine) — seeded at cost so NAV
  //    updates immediately.
  const investment = await createInvestment({
    fundId: deal.fund_id,
    companyName: deal.company_name,
    investmentKind: "initial",
    securityType,
    roundName: deal.round_name,
    investedAt: input.investedAt ?? new Date().toISOString().slice(0, 10),
    costBasis: Number(costBasis),
    fullyDilutedPct: input.fullyDilutedPct ?? null,
    roundValuation: latest?.pre_money != null && latest?.round_size != null
      ? Number(latest.pre_money) + Number(latest.round_size)
      : deal.pre_money,
    notes: `Closed from deal pipeline (${deal.id}).`,
    seedValuationAtCost: true,
    createdBy: input.by ?? null,
  })

  // 2. Flip the deal to closed with the investment linked.
  const history = [...deal.stage_history, { stage: "closed" as DealStage, at: new Date().toISOString(), by: input.by ?? null }]
  const rows = await sql`
    UPDATE deal_opportunities SET
      stage = 'closed',
      investment_id = ${investment.id},
      closed_at = NOW(),
      stage_history = ${JSON.stringify(history)}::jsonb,
      updated_at = NOW()
    WHERE id = ${input.dealId} RETURNING *`

  return { deal: normalizeDeal(rows[0]), investment }
}

// ── board rollup ────────────────────────────────────────────────────────

export interface PipelineRollup {
  totalActive: number
  byStage: Record<DealStage, number>
  proposedCheckTotal: number      // sum over active (non-terminal) deals
  closedCount: number
  passedCount: number
}

export async function getPipelineRollup(fundId: string): Promise<PipelineRollup> {
  const deals = await listDeals(fundId)
  const byStage = Object.fromEntries(DEAL_STAGES.map((s) => [s, 0])) as Record<DealStage, number>
  let proposedCheckTotal = 0
  for (const d of deals) {
    byStage[d.stage]++
    if (d.stage !== "closed" && d.stage !== "passed" && d.proposed_check) {
      proposedCheckTotal += d.proposed_check
    }
  }
  return {
    totalActive: deals.filter((d) => d.stage !== "closed" && d.stage !== "passed").length,
    byStage,
    proposedCheckTotal,
    closedCount: byStage.closed,
    passedCount: byStage.passed,
  }
}
