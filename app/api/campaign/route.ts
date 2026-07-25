/**
 * GET /api/campaign  — admin: list founder campaigns with progress + funnel.
 *
 * One row per founder_submissions, newest first, with the per-campaign investor
 * counts (total / contacted / opened / interested) that drive the progress bars
 * and analytics in the dashboard. ?status= filters by pipeline status.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  const status = new URL(req.url).searchParams.get("status")

  const rows = await sql`
    SELECT
      s.id, s.public_ref, s.startup_name, s.founder_name, s.founder_email,
      s.status, s.assessment_score, s.stage, s.sectors, s.outreach_campaign_id,
      s.created_at, s.updated_at,
      COALESCE(c.total, 0)          AS total,
      COALESCE(c.contacted, 0)      AS contacted,
      COALESCE(c.opened, 0)         AS opened,
      COALESCE(c.interested, 0)     AS interested,
      COALESCE(c.not_interested, 0) AS not_interested
    FROM founder_submissions s
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int                                              AS total,
        COUNT(*) FILTER (WHERE stage <> 'queued')::int             AS contacted,
        COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int         AS opened,
        COUNT(*) FILTER (WHERE interest_choice = 'yes')::int       AS interested,
        COUNT(*) FILTER (WHERE interest_choice = 'no')::int        AS not_interested
      FROM campaign_crm_entries e
      WHERE e.outreach_campaign_id = s.outreach_campaign_id
    ) c ON TRUE
    WHERE (${status}::text IS NULL OR s.status = ${status})
    ORDER BY s.created_at DESC
    LIMIT 200
  `

  const campaigns = (rows as any[]).map((r) => ({
    id: r.id,
    publicRef: r.public_ref,
    startupName: r.startup_name,
    founderName: r.founder_name,
    founderEmail: r.founder_email,
    status: r.status,
    assessmentScore: r.assessment_score,
    stage: r.stage,
    sectors: Array.isArray(r.sectors) ? r.sectors : [],
    campaignId: r.outreach_campaign_id,
    counts: {
      total: r.total, contacted: r.contacted, opened: r.opened,
      interested: r.interested, notInterested: r.not_interested,
    },
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
    updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  }))

  return NextResponse.json({ campaigns })
}
