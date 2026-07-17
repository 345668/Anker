/**
 * POST /api/outreach/campaigns/[id]/enqueue-crawl
 *
 * Enqueues every selected T1 member (or configurable tier) with a
 * LinkedIn URL into outreach_crawl_queue. Idempotent via UNIQUE(campaign_id, member_id).
 *
 * Body:
 *   { tiers?: ["t1","t2"] }   default ["t1"]
 *
 * Returns:
 *   { ok, enqueued, alreadyQueued, skippedNoUrl }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const camp = await sql<any[]>`
    SELECT id FROM outreach_campaigns WHERE id = ${campaignId} AND user_id = ${user.id}
  `
  if (!camp.length) return NextResponse.json({ error: "Campaign not found" }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  const tiers: string[] = Array.isArray(body.tiers) && body.tiers.length ? body.tiers : ["t1"]

  const members = await sql<any[]>`
    SELECT m.id AS member_id, c.display_linkedin
    FROM outreach_campaign_members m
    JOIN crm_entries c ON c.id = m.crm_entry_id
    WHERE m.campaign_id = ${campaignId} AND m.user_id = ${user.id}
      AND m.selected = true
      AND m.tier = ANY(${tiers})
  `

  let enqueued = 0
  let alreadyQueued = 0
  let skippedNoUrl = 0

  for (const m of members) {
    if (!m.display_linkedin) { skippedNoUrl++; continue }
    const inserted = await sql<any[]>`
      INSERT INTO outreach_crawl_queue (
        user_id, campaign_id, member_id, linkedin_url, requested_by
      ) VALUES (
        ${user.id}, ${campaignId}, ${m.member_id}, ${m.display_linkedin}, ${user.id}
      )
      ON CONFLICT (campaign_id, member_id) DO NOTHING
      RETURNING id
    `
    if (inserted.length) enqueued++
    else alreadyQueued++
  }

  return NextResponse.json({ ok: true, enqueued, alreadyQueued, skippedNoUrl })
}
