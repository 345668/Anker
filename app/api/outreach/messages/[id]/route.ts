/**
 * PATCH  /api/outreach/messages/[id]
 *   Update an outreach message — body edits, status transitions
 *   (draft → approved → queued), or mark sent (when delivered by hand).
 *
 * DELETE /api/outreach/messages/[id]
 *   Drop a draft.  Sent / delivered messages are preserved; we mark
 *   them cancelled instead.
 *
 * The hard rule from the playbook: "Never auto-send. Drafts only."
 * Approval requires an explicit PATCH with status='approved' from the
 * UI's approve button.
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const ALLOWED_STATUS = [
  "draft", "approved", "queued", "sent", "delivered",
  "failed", "cancelled", "replied", "accepted",
] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json()
    const { body: newBody, status, scheduledFor, deliveryProvider, deliveryProviderId, failedReason } = body ?? {}

    if (status !== undefined && !ALLOWED_STATUS.includes(status)) {
      return NextResponse.json({ error: `invalid status: ${status}` }, { status: 400 })
    }

    // Auto-stamp sent_at when transitioning to 'sent' or 'delivered'
    const now = new Date().toISOString()
    const sentAt = status === "sent" || status === "delivered" ? now : null
    const deliveredAt = status === "delivered" ? now : null

    const updated = await sql`
      UPDATE outreach_messages SET
        body                  = COALESCE(${newBody ?? null}, body),
        status                = COALESCE(${status ?? null}, status),
        scheduled_for         = COALESCE(${scheduledFor ?? null}::timestamptz, scheduled_for),
        sent_at               = COALESCE(${sentAt}::timestamptz, sent_at),
        delivered_at          = COALESCE(${deliveredAt}::timestamptz, delivered_at),
        delivery_provider     = COALESCE(${deliveryProvider ?? null}, delivery_provider),
        delivery_provider_id  = COALESCE(${deliveryProviderId ?? null}, delivery_provider_id),
        failed_reason         = COALESCE(${failedReason ?? null}, failed_reason),
        updated_at            = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *
    `
    if (!updated.length) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // When the connection request ships, advance the crm stage to 'contacted'.
    if (status === "sent" || status === "delivered") {
      const m = updated[0] as any
      if (m.kind === "connection_request") {
        await sql`
          UPDATE crm_entries SET
            stage             = 'contacted',
            last_contacted_at = COALESCE(last_contacted_at, NOW()),
            updated_at        = NOW()
          WHERE id = ${m.crm_entry_id} AND user_id = ${user.id}
            AND stage IN ('queued')
        `
      }
    }

    return NextResponse.json({ message: updated[0] })
  } catch (e: any) {
    console.error("[outreach/messages PATCH] error:", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    // Only delete drafts; everything else gets cancelled to preserve audit.
    const [m] = await sql`SELECT status FROM outreach_messages WHERE id = ${id} AND user_id = ${user.id} LIMIT 1`
    if (!m) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if ((m as any).status === "draft" || (m as any).status === "approved") {
      await sql`DELETE FROM outreach_messages WHERE id = ${id} AND user_id = ${user.id}`
      return NextResponse.json({ deleted: true })
    } else {
      await sql`UPDATE outreach_messages SET status = 'cancelled', updated_at = NOW()
                WHERE id = ${id} AND user_id = ${user.id}`
      return NextResponse.json({ cancelled: true })
    }
  } catch (e: any) {
    console.error("[outreach/messages DELETE] error:", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}
