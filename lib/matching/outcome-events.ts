/**
 * Outcome-capture writer for the learned matchmaking ranker.
 *
 * Appends milestone events (match_shown → contacted → replied → committed,
 * plus declined) to `match_outcome_events` so we accumulate labelled training
 * data for the ranker in lib/matching/v2/scoring.ts. Written from two stage
 * systems — crm_entries and the lp_firm_matches / lp_contact_matches pipeline
 * — through this one module, which normalises their differing stage
 * vocabularies onto the five-value outcome set.
 *
 * Contract: recording is best-effort telemetry and MUST NOT affect the
 * request. Every write is wrapped so a logging failure (missing table,
 * transient DB error) degrades to a console.warn and the caller proceeds.
 * The table is append-only; dedupe happens at training time, not here.
 *
 * Migration: scripts/migrations/2026-07-24-match-outcome-events.sql
 */
import { sql } from "@/lib/db"

/** Normalised milestone vocabulary — matches the table's CHECK constraint. */
export type OutcomeEventType = "match_shown" | "contacted" | "replied" | "committed" | "declined"

/** Emitting system — matches the table's `source` CHECK constraint. */
export type OutcomeSource = "crm_entry" | "lp_firm_match" | "lp_contact_match" | "outreach"

/**
 * Map a raw stage string (from EITHER the crm_entries vocabulary or the LP
 * PIPELINE_STAGES vocabulary) onto a normalised outcome milestone, or null
 * when the stage isn't one of the milestones we capture.
 *
 * Intermediate engagement stages (queued/identified/researched/meeting/
 * diligence/soft_circle) return null on purpose: match_shown is emitted once
 * at surfacing, and we keep the label set to the four clean milestones plus
 * declined rather than logging every intermediate hop.
 */
export function stageToOutcome(stage: string | null | undefined): OutcomeEventType | null {
  switch ((stage ?? "").toLowerCase()) {
    case "contacted":
      return "contacted"
    case "responded":
    case "replied":
      return "replied"
    case "committed":
    case "wired":
      return "committed"
    case "passed":
    case "declined":
    case "lost":
      return "declined"
    default:
      return null
  }
}

export interface OutcomeEventInput {
  userId?: string | null
  eventType: OutcomeEventType
  source: OutcomeSource
  /** The emitting row's id (crm_entries.id, lp_*_matches.id, …). */
  subjectId: string
  firmId?: string | null
  investorId?: string | null
  /** Score the ranker assigned at decision time. */
  matchScore?: number | null
  prevStage?: string | null
  newStage?: string | null
  metadata?: Record<string, unknown> | null
}

/**
 * Append one outcome event. Best-effort: never throws, never blocks the
 * caller — a failure is logged and swallowed.
 */
export async function recordOutcomeEvent(input: OutcomeEventInput): Promise<void> {
  try {
    const score =
      input.matchScore === undefined || input.matchScore === null || Number.isNaN(Number(input.matchScore))
        ? null
        : Math.round(Number(input.matchScore))
    await sql`
      INSERT INTO match_outcome_events (
        user_id, event_type, source, subject_id,
        firm_id, investor_id, match_score, prev_stage, new_stage, metadata
      ) VALUES (
        ${input.userId ?? null}, ${input.eventType}, ${input.source}, ${input.subjectId},
        ${input.firmId ?? null}, ${input.investorId ?? null}, ${score},
        ${input.prevStage ?? null}, ${input.newStage ?? null},
        ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb
      )
    `
  } catch (e: any) {
    // Telemetry must not break the request that triggered it.
    console.warn("[outcome-events] record failed (non-fatal):", e?.message ?? e)
  }
}

/**
 * Convenience for stage-transition call sites: map the new stage to an
 * outcome and record it, but only when the stage actually changed AND maps to
 * a milestone. No-ops otherwise. Returns the outcome recorded (or null).
 */
export async function recordStageTransition(args: {
  userId?: string | null
  source: OutcomeSource
  subjectId: string
  firmId?: string | null
  investorId?: string | null
  matchScore?: number | null
  prevStage?: string | null
  newStage?: string | null
  metadata?: Record<string, unknown> | null
}): Promise<OutcomeEventType | null> {
  if (!args.newStage || args.newStage === args.prevStage) return null
  const outcome = stageToOutcome(args.newStage)
  if (!outcome) return null
  await recordOutcomeEvent({ ...args, eventType: outcome })
  return outcome
}
