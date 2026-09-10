import { NextRequest } from "next/server"
import { sql } from "@/lib/db"
import { CallError, callResponse, callScope, readCallBody } from "@/lib/calls/access"
import { claimAnalysis } from "@/lib/calls/records"
import { analyzeCall } from "@/lib/calls/analyze"
import { AI_HEAVY, rateLimit } from "@/lib/rate-limit"
export const runtime = "nodejs"
export const maxDuration = 120
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return callResponse(async () => {
    const scope = await callScope(true)
    if ((await readCallBody(req)).consent !== true) throw new CallError("Confirm analysis with Anker's configured AI provider.")
    if (!rateLimit(`call-analysis:${scope.userId}`, AI_HEAVY).ok) throw new CallError("Too many analyses. Try again in a minute.", 429)
    const { id } = await params
    const { call, runId } = await claimAnalysis(scope, id)
    try {
      const analysis = await analyzeCall(call.transcript, { investorName: call.investor_name, persona: scope.persona })
      const rows = await sql`UPDATE investor_calls SET summary = ${analysis.summary}, sentiment = ${analysis.sentiment}, interest_level = ${analysis.interestLevel},
        objections = ${JSON.stringify(analysis.objections)}::jsonb, next_steps = ${JSON.stringify(analysis.nextSteps)}::jsonb,
        key_questions = ${JSON.stringify(analysis.keyQuestions)}::jsonb, draft_followup = ${analysis.draftFollowup},
        recommended_stage = ${analysis.recommendedStage}, generated_by = ${analysis.generatedBy}, analyzed_at = now(),
        status = 'needs_review', analysis_error = NULL, updated_at = now()
        WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId} AND analysis_run_id = ${runId} RETURNING id`
      if (!rows.length) throw new CallError("Call was deleted or a newer analysis replaced this request.", 409)
      return { ok: true }
    } catch (error) {
      await sql`UPDATE investor_calls SET status = 'analysis_failed', analysis_error = 'Analysis unavailable. Transcript retained; retry or review manually.', updated_at = now()
        WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId} AND analysis_run_id = ${runId}`
      throw error instanceof CallError ? error : new CallError("Analysis unavailable. Your transcript is saved; retry or review it manually.", 503)
    }
  })
}
