/**
 * GET  /api/campaign/[id]  — admin: one founder campaign + its exclusive
 *                            investor CRM (every investor contacted, with stage
 *                            + interest).  [id] is the founder_submissions id.
 * POST /api/campaign/[id]  — admin actions: { action: "pause"|"resume"|"complete" }
 *                            pause/resume flips the outreach_campaign status;
 *                            complete marks it done and stops further sends.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"
import { processSubmission } from "@/lib/campaign/orchestrator"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params

  const subs = await sql`
    SELECT s.*, oc.status AS campaign_status
    FROM founder_submissions s
    LEFT JOIN outreach_campaigns oc ON oc.id = s.outreach_campaign_id
    WHERE s.id = ${id} LIMIT 1
  `
  if (!subs.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const s = subs[0] as any

  const entries = s.outreach_campaign_id
    ? await sql`
        SELECT id, investor_name, investor_email, firm_id, match_score, match_rationale,
               stage, contacted_at, opened_at, responded_at, interest_choice, interest_at,
               founder_notified_at, send_error
        FROM campaign_crm_entries
        WHERE outreach_campaign_id = ${s.outreach_campaign_id}
        ORDER BY
          CASE stage WHEN 'interested' THEN 0 WHEN 'meeting' THEN 1 WHEN 'opened' THEN 2
                     WHEN 'contacted' THEN 3 WHEN 'not_interested' THEN 4 ELSE 5 END,
          match_score DESC NULLS LAST
      `
    : []

  return NextResponse.json({
    campaign: {
      id: s.id, publicRef: s.public_ref, startupName: s.startup_name,
      founderName: s.founder_name, founderEmail: s.founder_email, founderLinkedin: s.founder_linkedin,
      status: s.status, campaignStatus: s.campaign_status ?? null,
      sendApproved: s.send_approved !== false,
      hasDeck: !!s.deck_blob_key,
      assessmentScore: s.assessment_score, assessment: s.assessment_json ?? null,
      declineReason: s.decline_reason ?? null,
      stage: s.stage, sectors: Array.isArray(s.sectors) ? s.sectors : [],
      oneLiner: s.one_liner, website: s.website, location: s.location,
      campaignId: s.outreach_campaign_id,
      createdAt: s.created_at ? new Date(s.created_at).toISOString() : null,
    },
    entries: (entries as any[]).map((e) => ({
      id: e.id, investorName: e.investor_name, investorEmail: e.investor_email,
      firmId: e.firm_id, matchScore: e.match_score, rationale: e.match_rationale,
      stage: e.stage,
      contactedAt: e.contacted_at ? new Date(e.contacted_at).toISOString() : null,
      openedAt: e.opened_at ? new Date(e.opened_at).toISOString() : null,
      respondedAt: e.responded_at ? new Date(e.responded_at).toISOString() : null,
      interestChoice: e.interest_choice ?? null,
      founderNotified: !!e.founder_notified_at,
      sendError: e.send_error ?? null,
    })),
  })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const action = String(body?.action ?? "")

  const subs = await sql`SELECT outreach_campaign_id, status FROM founder_submissions WHERE id=${id} LIMIT 1`
  if (!subs.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const campaignId = (subs[0] as any).outreach_campaign_id

  // reassess: re-run the whole pipeline (e.g. after changing the threshold).
  // Resets the submission to 'received', discards any prior campaign, then
  // processes synchronously so the admin gets the fresh result immediately.
  if (action === "reassess") {
    if (campaignId) {
      await sql`DELETE FROM campaign_crm_entries WHERE outreach_campaign_id=${campaignId}`
      await sql`DELETE FROM outreach_campaigns WHERE id=${campaignId}`
    }
    await sql`
      UPDATE founder_submissions
      SET status='received', outreach_campaign_id=NULL, assessment_json=NULL,
          assessment_score=NULL, decline_reason=NULL, updated_at=NOW()
      WHERE id=${id}
    `
    const result = await processSubmission(id)
    return NextResponse.json({ ok: true, action, result })
  }

  // release: approve a held campaign for sending (used when auto-send is off).
  if (action === "release") {
    await sql`UPDATE founder_submissions SET send_approved=true, updated_at=NOW() WHERE id=${id}`
    if (campaignId) await sql`UPDATE outreach_campaigns SET status='active', updated_at=NOW() WHERE id=${campaignId}`
    return NextResponse.json({ ok: true, action })
  }

  if (!campaignId) return NextResponse.json({ error: "No campaign for this submission yet." }, { status: 409 })

  if (action === "pause") {
    await sql`UPDATE outreach_campaigns SET status='paused', updated_at=NOW() WHERE id=${campaignId}`
  } else if (action === "resume") {
    await sql`UPDATE outreach_campaigns SET status='active', updated_at=NOW() WHERE id=${campaignId}`
  } else if (action === "complete") {
    await sql`UPDATE outreach_campaigns SET status='done', updated_at=NOW() WHERE id=${campaignId}`
    await sql`UPDATE founder_submissions SET status='completed', updated_at=NOW() WHERE id=${id}`
  } else {
    return NextResponse.json({ error: "Unknown action" }, { status: 400 })
  }
  return NextResponse.json({ ok: true, action })
}
