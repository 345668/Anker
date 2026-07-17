/**
 * GET  /api/outreach/campaigns/[id]/schedule       — list schedules
 * POST /api/outreach/campaigns/[id]/schedule       — create a schedule
 *
 * Body (POST):
 *   { actionType: "send_batch"|"send_openers_nudge"|"send_bounces_retry",
 *     scheduledAt: ISO string,
 *     filterConfig?: object }
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

const ACTIONS = new Set(["send_batch", "send_openers_nudge", "send_bounces_retry"])

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const rows = await sql<any[]>`
    SELECT id, action_type, scheduled_at, filter_config, status, executed_at, result_summary
    FROM outreach_campaign_schedules
    WHERE campaign_id = ${campaignId} AND user_id = ${user.id}
    ORDER BY scheduled_at DESC
  `
  return NextResponse.json({ ok: true, schedules: rows })
}

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
  const actionType = String(body.actionType || "")
  if (!ACTIONS.has(actionType)) {
    return NextResponse.json({ error: `actionType must be one of ${Array.from(ACTIONS).join(", ")}` }, { status: 400 })
  }
  const scheduledAt = new Date(body.scheduledAt)
  if (isNaN(scheduledAt.getTime())) {
    return NextResponse.json({ error: "scheduledAt must be a valid ISO date" }, { status: 400 })
  }
  const filterConfig = body.filterConfig && typeof body.filterConfig === "object" ? body.filterConfig : {}

  const inserted = await sql<any[]>`
    INSERT INTO outreach_campaign_schedules (
      user_id, campaign_id, action_type, scheduled_at, filter_config
    ) VALUES (
      ${user.id}, ${campaignId}, ${actionType}, ${scheduledAt.toISOString()}, ${JSON.stringify(filterConfig)}::jsonb
    )
    RETURNING id, action_type, scheduled_at, status
  `

  return NextResponse.json({ ok: true, schedule: inserted[0] })
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await ctx.params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const url = new URL(req.url)
  const scheduleId = url.searchParams.get("scheduleId")
  if (!scheduleId) return NextResponse.json({ error: "scheduleId required" }, { status: 400 })

  await sql`
    UPDATE outreach_campaign_schedules
    SET status = 'cancelled', updated_at = NOW()
    WHERE id = ${scheduleId} AND campaign_id = ${campaignId} AND user_id = ${user.id}
      AND status = 'pending'
  `
  return NextResponse.json({ ok: true, cancelled: scheduleId })
}
