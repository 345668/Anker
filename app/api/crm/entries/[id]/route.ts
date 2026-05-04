/**
 * PATCH  /api/crm/entries/[id]   — partial update (stage, notes, owner,
 *                                    last_contacted_at).  Used by the kanban
 *                                    drag-drop and the row "..." menu.
 * DELETE /api/crm/entries/[id]   — drop a row from the CRM.  We hard-delete;
 *                                    re-uploading the same xlsx will recreate it
 *                                    if the row is still ticked.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const ALLOWED_STAGES = [
  "queued",
  "contacted",
  "responded",
  "meeting",
  "in_diligence",
  "committed",
  "passed",
] as const

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json()
    const { stage, notes, owner, lastContactedAt } = body ?? {}

    if (stage !== undefined && !ALLOWED_STAGES.includes(stage)) {
      return NextResponse.json({ error: `invalid stage: ${stage}` }, { status: 400 })
    }

    // Build a single UPDATE that only touches the fields supplied.  Using
    // COALESCE keeps untouched fields intact and lets us avoid building
    // a dynamic SQL string.
    const updated = await sql`
      UPDATE crm_entries SET
        stage              = COALESCE(${stage ?? null}, stage),
        notes              = COALESCE(${notes ?? null}, notes),
        owner              = COALESCE(${owner ?? null}, owner),
        last_contacted_at  = COALESCE(${lastContactedAt ?? null}::timestamptz, last_contacted_at),
        updated_at         = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *
    `
    if (!updated.length) {
      return NextResponse.json({ error: "Not found" }, { status: 404 })
    }
    return NextResponse.json({ entry: updated[0] })
  } catch (e: any) {
    console.error("[crm/entries PATCH] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to update" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const deleted = await sql`
      DELETE FROM crm_entries WHERE id = ${id} AND user_id = ${user.id} RETURNING id
    `
    if (!deleted.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[crm/entries DELETE] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to delete" }, { status: 500 })
  }
}
