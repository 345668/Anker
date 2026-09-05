/**
 * GET  /api/calls           — list the user's investor calls (newest first).
 * POST /api/calls           — create a call from a transcript and analyze it.
 *   body: { transcript, title?, investorName?, crmEntryId?, occurredAt? }
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { analyzeCall } from "@/lib/calls/analyze"
import { founderContextForUser } from "@/lib/outreach/reply-actions"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const rows = await sql`
    SELECT id, crm_entry_id, title, investor_name, occurred_at, summary, sentiment,
           interest_level, objections, next_steps, key_questions, draft_followup,
           recommended_stage, status, analyzed_at, created_at
    FROM investor_calls WHERE user_id = ${user.id}
    ORDER BY created_at DESC LIMIT 100
  `
  return NextResponse.json({ calls: rows })
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const transcript = String(body?.transcript ?? "").trim()
  if (!transcript) return NextResponse.json({ error: "transcript is required" }, { status: 400 })
  const crmEntryId = typeof body?.crmEntryId === "string" ? body.crmEntryId : null

  // Investor + founder context for a sharper analysis.
  let investorName = String(body?.investorName ?? "").trim() || null
  let investorFirm: string | undefined
  if (crmEntryId) {
    const [e] = (await sql`SELECT display_name, display_type FROM crm_entries WHERE id = ${crmEntryId} AND user_id = ${user.id} LIMIT 1`) as any[]
    if (e) { investorName = investorName || e.display_name; investorFirm = e.display_type ?? undefined }
  }
  const founder = (await founderContextForUser(user.id).catch(() => null)) ?? undefined
  const analysis = await analyzeCall(transcript, { investorName: investorName ?? undefined, investorFirm, founder })

  const [row] = (await sql`
    INSERT INTO investor_calls (
      user_id, crm_entry_id, title, investor_name, occurred_at, transcript,
      summary, sentiment, interest_level, objections, next_steps, key_questions,
      draft_followup, recommended_stage, generated_by, analyzed_at, status,
      created_at, updated_at
    ) VALUES (
      ${user.id}, ${crmEntryId}, ${String(body?.title ?? "").trim() || null}, ${investorName},
      ${body?.occurredAt ? new Date(body.occurredAt).toISOString() : null}::timestamptz, ${transcript},
      ${analysis.summary}, ${analysis.sentiment}, ${analysis.interestLevel},
      ${JSON.stringify(analysis.objections)}::jsonb, ${JSON.stringify(analysis.nextSteps)}::jsonb,
      ${JSON.stringify(analysis.keyQuestions)}::jsonb, ${analysis.draftFollowup}, ${analysis.recommendedStage},
      ${analysis.generatedBy}, NOW(), 'analyzed', NOW(), NOW()
    ) RETURNING *
  `) as any[]

  // Advance the CRM stage if we linked an investor and have a forward stage.
  if (crmEntryId && analysis.recommendedStage) {
    await sql`
      UPDATE crm_entries SET stage = ${analysis.recommendedStage}, last_contacted_at = COALESCE(last_contacted_at, NOW()), updated_at = NOW()
      WHERE id = ${crmEntryId} AND user_id = ${user.id}
    `.catch(() => {})
  }

  return NextResponse.json({ call: row })
}
