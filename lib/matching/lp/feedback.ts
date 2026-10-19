/**
 * A person's verdict on a suggested LP (docs/architecture/63 section 4.5). Kept as the workspace's label; when asked, also "never suggest again", which the next run honours
 * through the same saved exclusions the rules read. Nothing here trains anything: the labels are for the evaluation in section 8.
 */
import { sql } from "@/lib/db"
import { recordOutcomeEvent } from "@/lib/matching/outcome-events"
import { getMatch, type MatchKind } from "./matches"

export const VERDICTS = ["fit", "not_a_fit", "already_known", "wrong_data"] as const
export type Verdict = (typeof VERDICTS)[number]
export const REASONS = ["wrong_type", "too_small", "wrong_geography", "wrong_sector", "already_in_touch", "not_investing", "other"] as const
export class FeedbackError extends Error { constructor(message: string, readonly status = 422) { super(message) } }

export interface FeedbackInput { kind: MatchKind; matchId: string; verdict: Verdict; reason?: string | null; note?: string | null; neverAgain?: boolean }

export async function recordFeedback(scope: { orgId: string; userId: string }, input: FeedbackInput): Promise<{ entityKey: string; excluded: boolean; name: string }> {
  if (!VERDICTS.includes(input.verdict)) throw new FeedbackError("Choose a verdict: fit, not a fit, already known or wrong data.")
  const reason = input.reason ? String(input.reason).slice(0, 40) : null
  if (reason && !(REASONS as readonly string[]).includes(reason)) throw new FeedbackError("That reason is not one of the listed ones.")
  const note = input.note ? String(input.note).trim().slice(0, 500) : null
  const m = await getMatch(scope.orgId, input.kind, input.matchId)
  if (!m) throw new FeedbackError("That match is not in this workspace.", 404)
  const never = !!input.neverAgain && input.verdict !== "fit"
  await sql`INSERT INTO lp_match_feedback (org_id, session_id, match_kind, match_id, entity_key, verdict, reason, note, never_again, match_score, created_by)
    VALUES (${scope.orgId}, ${m.sessionId}, ${input.kind}, ${m.id}, ${m.entityKey}, ${input.verdict}, ${reason}, ${note}, ${never}, ${m.score}, ${scope.userId})`
  if (never) {
    await sql`INSERT INTO founder_match_exclusions (org_id, entity_key, reason, created_by) VALUES (${scope.orgId}, ${m.entityKey}, ${reason ?? input.verdict}, ${scope.userId})
      ON CONFLICT (org_id, entity_key) DO UPDATE SET reason = EXCLUDED.reason`
  }
  // "Not a fit" is the one verdict that maps onto the outcome vocabulary (declined); the feedback row itself carries the rest.
  if (input.verdict === "not_a_fit") {
    await recordOutcomeEvent({ userId: scope.userId, eventType: "declined", source: input.kind === "firm" ? "lp_firm_match" : "lp_contact_match", subjectId: m.id, matchScore: m.score, metadata: { feedback: true, reason, neverAgain: never } })
  }
  return { entityKey: m.entityKey, excluded: never, name: m.name }
}

/** Undo "never suggest again" for one LP. The verdict stays on record. */
export async function clearExclusion(scope: { orgId: string }, kind: MatchKind, matchId: string): Promise<boolean> {
  const m = await getMatch(scope.orgId, kind, matchId)
  if (!m) throw new FeedbackError("That match is not in this workspace.", 404)
  const rows = (await sql`DELETE FROM founder_match_exclusions WHERE org_id = ${scope.orgId} AND entity_key = ${m.entityKey} RETURNING entity_key`) as any[]
  return rows.length > 0
}
