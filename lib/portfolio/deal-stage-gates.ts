/**
 * Deal stage gates — required entries + checks per pipeline stage (NO database
 * imports, safe to import from client components).
 *
 * Each stage lists the requirements to ADVANCE OUT of it (from → next forward
 * stage). `evaluateGate` runs pure predicates over a GateContext assembled by
 * the server (or the client from already-fetched data) and returns which
 * requirements pass. The server hard-blocks forward transitions when any fail;
 * the UI mirrors the same list as a checklist.
 *
 * Backward movement (`canRegress`) is intentionally ungated — you can always
 * step a deal back to an earlier active stage to correct course.
 *
 * All types are imported as `import type` so this module never pulls the
 * Postgres driver into the browser bundle.
 */

import { DEAL_STAGES, DEAL_CRITERIA, type DealStage } from "./deal-constants"
import type { DealFull, DealEvaluation, VoteTally, TermGrid } from "./deal-pipeline"
import type { DealFounder } from "./deal-founders"
import type { DealDocument, DealDocCategory } from "./deal-documents"

export interface GateContext {
  deal: DealFull
  evaluation: DealEvaluation | null
  tally: VoteTally
  terms: TermGrid[]
  founders: DealFounder[]
  documents: DealDocument[]
}

export interface GateRequirement {
  key: string
  label: string
  hint: string
}

export interface GateResult extends GateRequirement {
  ok: boolean
}

// ── small predicate helpers ───────────────────────────────────────────────

const hasDoc = (c: GateContext, cat: DealDocCategory) =>
  c.documents.some((d) => d.category === cat)

const primaryFounder = (c: GateContext): DealFounder | null =>
  c.founders.find((f) => f.is_primary) ?? c.founders[0] ?? null

const scoredCount = (c: GateContext): number =>
  DEAL_CRITERIA.filter((cr) => c.evaluation?.scores?.[cr.key]?.score != null).length

const nonEmpty = (v: unknown): boolean =>
  v != null && String(v).trim().length > 0

// ── per-stage requirements (to advance OUT of the key stage) ──────────────

type GateDef = { req: GateRequirement; test: (c: GateContext) => boolean }

const STAGE_GATES: Record<DealStage, GateDef[]> = {
  sourced: [
    { req: { key: "sector", label: "Sector recorded", hint: "Set the company's sector." }, test: (c) => nonEmpty(c.deal.sector) },
    { req: { key: "round", label: "Round named", hint: "Which round is this (pre-seed, seed, A…)?" }, test: (c) => nonEmpty(c.deal.round_name) },
    { req: { key: "founder", label: "At least one founder profile", hint: "Add the founding team — start with the primary founder." }, test: (c) => c.founders.length > 0 },
    { req: { key: "source", label: "Source recorded", hint: "How did this deal reach the fund?" }, test: (c) => nonEmpty(c.deal.source) },
  ],
  screened: [
    { req: { key: "one_liner", label: "Thesis one-liner", hint: "One sentence on why this deal fits the fund." }, test: (c) => nonEmpty(c.deal.one_liner) },
    { req: { key: "scored3", label: "At least 3 scorecard criteria scored", hint: "Begin the scorecard — score at least three criteria." }, test: (c) => scoredCount(c) >= 3 },
    { req: { key: "deck", label: "Pitch deck uploaded", hint: "Upload the deck to the deal data room (category: Deck)." }, test: (c) => hasDoc(c, "deck") },
  ],
  deep_dive: [
    { req: { key: "scoredAll", label: "Full scorecard completed", hint: "Score every criterion in the scorecard." }, test: (c) => scoredCount(c) >= DEAL_CRITERIA.length },
    { req: { key: "weighted", label: "Weighted score computed", hint: "The scorecard produces a weighted score once criteria are scored." }, test: (c) => c.evaluation?.weighted_score != null },
    { req: { key: "primaryComplete", label: "Primary founder profile complete", hint: "Primary founder needs an email and a short bio." }, test: (c) => { const f = primaryFounder(c); return !!f && nonEmpty(f.email) && nonEmpty(f.bio) } },
    { req: { key: "coreDocs", label: "Core diligence docs uploaded", hint: "Data room needs a deck, financial model, and cap table." }, test: (c) => hasDoc(c, "deck") && hasDoc(c, "financial_model") && hasDoc(c, "cap_table") },
  ],
  ic_scheduled: [
    { req: { key: "memo", label: "IC memo generated", hint: "Generate the investment-committee memo." }, test: (c) => nonEmpty(c.deal.memo_md) },
    { req: { key: "votes", label: "IC votes recorded", hint: "Record at least one IC vote before approving." }, test: (c) => c.tally.total > 0 },
    { req: { key: "votesCarry", label: "IC votes carry the deal", hint: "Approvals (incl. conditional) must outnumber declines." }, test: (c) => c.tally.total > 0 && c.tally.approve + c.tally.approveWithConditions > c.tally.decline },
  ],
  ic_approved: [
    { req: { key: "terms", label: "Term grid proposed", hint: "Add at least one term-sheet version." }, test: (c) => c.terms.length > 0 },
  ],
  term_sheet: [
    { req: { key: "termsPriced", label: "Latest terms priced", hint: "Latest term grid needs a check amount and pre-money." }, test: (c) => { const t = c.terms[0]; return !!t && t.check_amount != null && t.pre_money != null } },
    { req: { key: "proposedCheck", label: "Proposed check set", hint: "Set the proposed check on the deal." }, test: (c) => c.deal.proposed_check != null },
    { req: { key: "legal", label: "Legal document uploaded", hint: "Upload the term sheet / legal doc to the data room." }, test: (c) => hasDoc(c, "legal") },
  ],
  committed: [
    // Advancing out of committed = closing, which runs through closeDeal().
    // These are readiness checks the UI surfaces before the Close action.
    { req: { key: "check", label: "Check amount available", hint: "A term-grid check or proposed check is needed to close." }, test: (c) => (c.terms[0]?.check_amount ?? c.deal.proposed_check) != null },
  ],
  closed: [],
  passed: [],
}

/** Requirements list (definitions only) for a stage — used by the UI. */
export function stageRequirements(stage: DealStage): GateRequirement[] {
  return (STAGE_GATES[stage] ?? []).map((g) => g.req)
}

/** Evaluate every requirement for advancing OUT of `stage`. */
export function evaluateGate(stage: DealStage, ctx: GateContext): GateResult[] {
  return (STAGE_GATES[stage] ?? []).map((g) => ({ ...g.req, ok: g.test(ctx) }))
}

/** True when all forward requirements for the stage pass. */
export function gatePasses(stage: DealStage, ctx: GateContext): boolean {
  return evaluateGate(stage, ctx).every((r) => r.ok)
}

// ── backward movement ─────────────────────────────────────────────────────

/** Active (non-terminal) stages in pipeline order. */
export const ACTIVE_STAGES: DealStage[] = DEAL_STAGES.filter((s) => s !== "closed" && s !== "passed")

/**
 * Can `from` move BACK to `to`? Any earlier active stage, and `passed` can be
 * reopened to any active stage. Reopening `closed` is handled separately by
 * reopenDeal() because it touches the linked investment.
 */
export function canRegress(from: DealStage, to: DealStage): boolean {
  if (to === "closed" || to === "passed") return false
  if (from === "passed") return ACTIVE_STAGES.includes(to)
  const fi = ACTIVE_STAGES.indexOf(from)
  const ti = ACTIVE_STAGES.indexOf(to)
  return fi >= 0 && ti >= 0 && ti < fi
}
