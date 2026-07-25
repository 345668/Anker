/**
 * GET /api/cron/campaign-send
 *
 * Progressive sender for founder campaigns. For every submission that's
 * campaign_ready or outreaching, sends the next wave of drafted-but-unsent
 * investor emails (each carries the founder story, a deck link, and one-click
 * Interested / Not-interested links + the Anker AI signature). Small waves keep
 * deliverability healthy and let us watch early results.
 *
 * When a campaign's queue is drained, the submission flips to 'completed', the
 * outreach_campaign is marked 'done', and the founder gets a wrap-up email.
 *
 * Auth: CRON_SECRET (Bearer or ?secret=), fails closed. ?wave=N overrides the
 * per-campaign wave size for this run.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { isResendConfigured, sendEmail } from "@/lib/email/resend"
import { recordOutcomeEvent } from "@/lib/matching/outcome-events"
import { sendCampaignComplete } from "@/lib/email/founder-lifecycle"
import { ANKER_REPLY_TO, ANKER_BCC } from "@/lib/email/signature"
import { getCampaignSettings } from "@/lib/campaign/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

function authorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  if ((req.headers.get("authorization") || "") === `Bearer ${secret}`) return true
  return new URL(req.url).searchParams.get("secret") === secret
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!isResendConfigured()) {
    return NextResponse.json({ error: "Email not configured (RESEND_API_KEY missing)." }, { status: 503 })
  }

  const settings = await getCampaignSettings()
  const waveSize = Math.min(Number(new URL(req.url).searchParams.get("wave")) || settings.waveSize, 100)

  // Active campaigns: submissions ready or mid-outreach, whose campaign isn't
  // paused (admin can pause from the dashboard to halt further sends). When
  // auto-send is off, only campaigns the admin has released (send_approved) go.
  const subs = await sql`
    SELECT s.id, s.public_ref, s.founder_name, s.founder_email, s.startup_name,
           s.status, s.outreach_campaign_id
    FROM founder_submissions s
    JOIN outreach_campaigns oc ON oc.id = s.outreach_campaign_id
    WHERE s.status IN ('campaign_ready','outreaching')
      AND oc.status <> 'paused'
      AND (${settings.autoSend} OR s.send_approved = true)
    ORDER BY s.updated_at ASC
    LIMIT 25
  `

  const summary: any[] = []
  for (const sub of subs as any[]) {
    const campaignId = sub.outreach_campaign_id

    // Next wave: drafted, not yet sent, no prior send error.
    const queue = await sql`
      SELECT id, investor_id, firm_id, investor_email, investor_name, match_score, draft_subject, draft_body
      FROM campaign_crm_entries
      WHERE outreach_campaign_id = ${campaignId} AND stage = 'queued'
        AND draft_body IS NOT NULL AND send_error IS NULL
      ORDER BY match_score DESC NULLS LAST, created_at ASC
      LIMIT ${waveSize}
    `

    if (sub.status === 'campaign_ready') {
      await sql`UPDATE founder_submissions SET status='outreaching', updated_at=NOW() WHERE id=${sub.id}`
    }

    let sent = 0, failed = 0
    for (const e of queue as any[]) {
      if (!e.investor_email) {
        await sql`UPDATE campaign_crm_entries SET send_error='no email', updated_at=NOW() WHERE id=${e.id}`
        continue
      }
      try {
        const res = await sendEmail({
          to: e.investor_email,
          subject: e.draft_subject || `Intro: ${sub.startup_name}`,
          text: e.draft_body,
          replyTo: ANKER_REPLY_TO,
          // BCC the founder on their own outreach + the alt Anker address.
          bcc: [...ANKER_BCC, sub.founder_email].filter(Boolean),
          noTracking: true, // keep one-click interest/deck links pristine
        })
        await sql`
          UPDATE campaign_crm_entries
          SET stage='contacted', contacted_at=NOW(), sent_at=NOW(),
              resend_id=${res.resendId}, message_id=${res.messageId}, updated_at=NOW()
          WHERE id=${e.id}
        `
        await recordOutcomeEvent({
          eventType: "contacted", source: "outreach", subjectId: e.id,
          firmId: e.firm_id, investorId: e.investor_id, matchScore: e.match_score,
          prevStage: "queued", newStage: "contacted",
          metadata: { campaignId, submissionId: sub.id, publicRef: sub.public_ref },
        })
        sent++
      } catch (err: any) {
        failed++
        await sql`UPDATE campaign_crm_entries SET send_error=${String(err?.message ?? "send failed").slice(0, 500)}, updated_at=NOW() WHERE id=${e.id}`
        console.error("[campaign-send] failed for", e.id, err?.message ?? err)
      }
    }

    // Anything still sendable?
    const [{ remaining }] = await sql`
      SELECT COUNT(*)::int AS remaining FROM campaign_crm_entries
      WHERE outreach_campaign_id=${campaignId} AND stage='queued'
        AND draft_body IS NOT NULL AND send_error IS NULL
    `

    let completed = false
    if (Number(remaining) === 0) {
      completed = true
      const [tallies] = await sql`
        SELECT
          COUNT(*) FILTER (WHERE stage <> 'queued')::int         AS contacted,
          COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int      AS opened,
          COUNT(*) FILTER (WHERE interest_choice = 'yes')::int    AS interested
        FROM campaign_crm_entries
        WHERE outreach_campaign_id=${campaignId}
      `
      await sql`UPDATE founder_submissions SET status='completed', updated_at=NOW() WHERE id=${sub.id}`
      await sql`UPDATE outreach_campaigns SET status='done', updated_at=NOW() WHERE id=${campaignId}`
      try {
        await sendCampaignComplete({
          to: sub.founder_email, founderName: sub.founder_name, startupName: sub.startup_name,
          contacted: tallies.contacted, opened: tallies.opened, interested: tallies.interested,
        })
      } catch (e: any) {
        console.error("[campaign-send] wrap-up email failed:", e?.message ?? e)
      }
    }

    summary.push({ submission: sub.public_ref, campaignId, sent, failed, remaining: Number(remaining), completed })
  }

  return NextResponse.json({
    ok: true,
    campaigns: summary.length,
    totalSent: summary.reduce((n, s) => n + s.sent, 0),
    summary,
  })
}
