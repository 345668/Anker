/**
 * GET  /api/outreach/campaigns/[id]/members
 *   List planned investors for a campaign, joined with their live
 *   crm_entries profile so the Outreach page can show full details
 *   without a second round-trip.
 *
 * POST /api/outreach/campaigns/[id]/members
 *   Bulk add { crmEntryIds: string[] }.  Duplicates are no-ops (UNIQUE
 *   constraint).  Returns counts.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

function serializeMember(r: any) {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    crmEntryId: r.crm_entry_id,
    status: r.status,
    notes: r.notes ?? null,
    addedAt: r.added_at ? new Date(r.added_at).toISOString() : null,
    draftedAt: r.drafted_at ? new Date(r.drafted_at).toISOString() : null,
    sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
    // joined crm_entries profile (display + research)
    displayName: r.display_name,
    displayTitle: r.display_title ?? null,
    displayEmail: r.display_email ?? null,
    displayLinkedin: r.display_linkedin ?? null,
    displayLocation: r.display_location ?? null,
    displayType: r.display_type ?? null,
    displayScore: r.display_score ?? null,
    displayTier: r.display_tier ?? null,
    whyMatch: r.why_match ?? null,
    researchSummary: r.research_summary ?? null,
    researchUrl: r.research_url ?? null,
    crmStage: r.stage ?? null,
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const rows = await sql`
      SELECT m.id, m.campaign_id, m.crm_entry_id, m.status, m.notes,
             m.added_at, m.drafted_at, m.sent_at,
             e.display_name, e.display_title, e.display_email, e.display_linkedin,
             e.display_location, e.display_type, e.display_score, e.display_tier,
             e.why_match, e.research_summary, e.research_url, e.stage
      FROM outreach_campaign_members m
      LEFT JOIN crm_entries e ON e.id = m.crm_entry_id AND e.user_id = m.user_id
      WHERE m.campaign_id = ${id} AND m.user_id = ${user.id}
      ORDER BY m.added_at DESC
    `
    return NextResponse.json({ members: (rows as any[]).map(serializeMember) })
  } catch (e: any) {
    console.error("[campaign members GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to load" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const ids: string[] = Array.isArray(body?.crmEntryIds)
      ? body.crmEntryIds.map((x: any) => String(x ?? "").trim()).filter(Boolean)
      : []
    if (!ids.length) return NextResponse.json({ error: "crmEntryIds[] required" }, { status: 400 })

    const [campaign] = await sql`
      SELECT id FROM outreach_campaigns WHERE id = ${id} AND user_id = ${user.id}
    ` as any[]
    if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

    // Only insert for crm_entries the user actually owns.
    const valid = await sql`
      SELECT id FROM crm_entries WHERE id = ANY(${ids}::text[]) AND user_id = ${user.id}
    ` as any[]
    const validIds = valid.map((r: any) => String(r.id))

    let added = 0
    let alreadyPresent = 0
    for (const crmId of validIds) {
      const inserted = await sql`
        INSERT INTO outreach_campaign_members (campaign_id, user_id, crm_entry_id, status, added_at, updated_at)
        VALUES (${id}, ${user.id}, ${crmId}, 'planned', NOW(), NOW())
        ON CONFLICT (campaign_id, crm_entry_id) DO NOTHING
        RETURNING id
      `
      if (inserted.length) added++
      else alreadyPresent++
    }

    // Bump the campaign's updated_at + flip status to 'active' on first add.
    await sql`
      UPDATE outreach_campaigns SET
        status = CASE WHEN status = 'draft' AND ${added}::int > 0 THEN 'active' ELSE status END,
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
    `
    return NextResponse.json({ added, alreadyPresent, skipped: ids.length - validIds.length })
  } catch (e: any) {
    console.error("[campaign members POST] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to add" }, { status: 500 })
  }
}
