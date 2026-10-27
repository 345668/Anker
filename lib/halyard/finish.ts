import "server-only"
import { sql } from "@/lib/db"
import { saveCall } from "@/lib/calls/records"
import { MAX_TRANSCRIPT } from "@/lib/calls/contracts"
import type { CallScope } from "@/lib/calls/access"
import { analyzeCall } from "@/lib/calls/analyze"
import { propose } from "@/lib/actions/store"
import type { ModelFn } from "./core"
import { endSession, HalyardError, latestBrief, type SessionRow } from "./sessions"
import { compileTranscript, draftNotes, latestNotes, defaultNotesModel } from "./notes"

/**
 * End of a call (docs/architecture/62 section 9). The session keeps the FULL transcript (a 90-minute call is about 90,000 characters); the call row in `investor_calls` holds up to the
 * existing 60,000-character cap with a marker; notes are drafted from the chunked path; the existing analysis runs on the transcript, or, when it is longer than the cap, on a condensed
 * version (the brief, the notes and the end of the call); then PROPOSALS are made, never writes: move the contact's stage and add the next steps as tasks (R0), approved by a person.
 * Every step after the session is ended is best-effort: a failure is reported as a warning and never un-ends the call.
 */
export interface FinishDeps { notesModel?: ModelFn; analyze?: typeof analyzeCall; proposeAction?: typeof propose }
export interface FinishResult { session: SessionRow; callId: string | null; notes: boolean; analysis: boolean; proposals: number; truncatedInCall: boolean; warnings: string[] }
export const TRUNCATION_MARKER = "\n[…the rest of this transcript is in the Halyard session]"
const STAGE: Record<string, string> = { meeting: "meeting", responded: "responded", passed: "passed" }

export async function finishSession(s: SessionRow, scope: CallScope, deps: FinishDeps = {}): Promise<FinishResult> {
  const warnings: string[] = []
  const ended = await endSession(s)
  const res: FinishResult = { session: ended, callId: ended.call_id, notes: false, analysis: false, proposals: 0, truncatedInCall: false, warnings }
  const transcript = await compileTranscript(s.id)
  if (transcript.trim().length < 20) { warnings.push("There was too little to make a call record from."); return res }

  if (!ended.call_id) {
    try {
      const inCall = transcript.length > MAX_TRANSCRIPT ? transcript.slice(0, MAX_TRANSCRIPT - TRUNCATION_MARKER.length) + TRUNCATION_MARKER : transcript
      res.truncatedInCall = inCall !== transcript
      const { call } = await saveCall(scope, { title: s.title || "Halyard call", transcript: inCall, crmEntryId: s.crm_entry_id, occurredAt: new Date(s.started_at).toISOString(), externalId: s.id, consent: true }, "halyard-web")
      res.callId = call.id
      await sql`UPDATE halyard_sessions SET call_id = ${call.id} WHERE id = ${s.id}`
    } catch (e: any) { warnings.push(`The call record could not be created: ${e?.message ?? "unknown error"}`) }
  }
  try { const r = await draftNotes(ended, deps.notesModel ?? defaultNotesModel); void r; res.notes = true } catch (e: any) { warnings.push(`Notes could not be drafted: ${e instanceof HalyardError ? e.message : "try again from the call page"}`) }
  if (res.callId) {
    try {
      const notes = await latestNotes(s.id), brief = await latestBrief(s.id)
      const forAnalysis = transcript.length <= MAX_TRANSCRIPT ? transcript : [
        "[This call was longer than the analysis limit. What follows is the running brief, the notes and the last part of the call.]",
        brief?.brief && `Running brief:\n${brief.brief}`, notes && `Notes:\n${[notes.body.summary, ...notes.body.keyPoints, ...notes.body.decisions, ...notes.body.actionItems].filter(Boolean).map((x) => "- " + x).join("\n")}`,
        `End of the call:\n${transcript.slice(-20000)}`,
      ].filter(Boolean).join("\n\n").slice(0, MAX_TRANSCRIPT)
      const a = await (deps.analyze ?? analyzeCall)(forAnalysis, { persona: scope.persona })
      await sql`UPDATE investor_calls SET summary = ${a.summary}, sentiment = ${a.sentiment}, interest_level = ${a.interestLevel}, objections = ${JSON.stringify(a.objections)}::jsonb, next_steps = ${JSON.stringify(a.nextSteps)}::jsonb,
        key_questions = ${JSON.stringify(a.keyQuestions)}::jsonb, draft_followup = ${a.draftFollowup}, recommended_stage = ${a.recommendedStage}, generated_by = ${a.generatedBy}, analyzed_at = now(), status = 'needs_review', analysis_error = NULL, updated_at = now()
        WHERE id = ${res.callId} AND org_id = ${scope.orgId}`
      res.analysis = true
      if (s.crm_entry_id && scope.persona !== "lp") {
        const make = deps.proposeAction ?? propose, ctx = { runId: `halyard:${s.id}`, trust: "untrusted" as const }
        const stage = STAGE[a.recommendedStage]
        if (stage) try { await make(scope, "crm_update_stage", { entryId: s.crm_entry_id, stage }, ctx); res.proposals++ } catch (e: any) { warnings.push(`A stage change could not be proposed: ${e?.message}`) }
        for (const step of a.nextSteps.slice(0, 5)) try { await make(scope, "crm_add_task", { title: step, entryId: s.crm_entry_id }, ctx); res.proposals++ } catch (e: any) { warnings.push(`A task could not be proposed: ${e?.message}`) }
      }
    } catch (e: any) {
      await sql`UPDATE investor_calls SET status = 'analysis_failed', analysis_error = 'Analysis unavailable. Transcript retained; retry or review manually.', updated_at = now() WHERE id = ${res.callId} AND org_id = ${scope.orgId}`.catch(() => {})
      warnings.push(`The call could not be analysed: ${e?.message ?? "try again from the call page"}`)
    }
  }
  return res
}
