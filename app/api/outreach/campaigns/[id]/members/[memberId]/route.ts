/**
 * PATCH  /api/outreach/campaigns/[id]/members/[memberId]
 *   Update { status?, notes? } on a single member.
 * DELETE /api/outreach/campaigns/[id]/members/[memberId]
 *   Remove a member from a campaign (does NOT delete the crm_entry).
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const STATUSES = ["planned", "drafted", "sent", "skipped", "replied"] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id, memberId } = await ctx.params
    const body = await req.json().catch(() => ({}))
    const status = body?.status !== undefined ? String(body.status) : undefined
    const notes = body?.notes !== undefined ? String(body.notes) : undefined

    if (status !== undefined && !STATUSES.includes(status as any)) {
      return NextResponse.json({ error: `invalid status: ${status}` }, { status: 400 })
    }

    const now = new Date().toISOString()
    const sentAt = status === "sent" ? now : null
    const draftedAt = status === "drafted" ? now : null

    const [updated] = await sql`
      UPDATE outreach_campaign_members SET
        status      = COALESCE(${status ?? null}, status),
        notes       = COALESCE(${notes ?? null}, notes),
        sent_at     = COALESCE(${sentAt}::timestamptz, sent_at),
        drafted_at  = COALESCE(${draftedAt}::timestamptz, drafted_at),
        updated_at  = NOW()
      WHERE id = ${memberId} AND campaign_id = ${id} AND user_id = ${user.id}
      RETURNING *
    ` as any[]
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })

    return NextResponse.json({
      member: {
        id: updated.id,
        status: updated.status,
        notes: updated.notes ?? null,
        sentAt: updated.sent_at,
        draftedAt: updated.drafted_at,
      },
    })
  } catch (e: any) {
    console.error("[campaign members PATCH] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; memberId: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id, memberId } = await ctx.params
    const deleted = await sql`
      DELETE FROM outreach_campaign_members
      WHERE id = ${memberId} AND campaign_id = ${id} AND user_id = ${user.id}
      RETURNING id
    `
    if (!deleted.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[campaign members DELETE] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
