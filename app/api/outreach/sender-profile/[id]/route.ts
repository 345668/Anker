/**
 * PATCH  /api/outreach/sender-profile/[id]  — set default { makeDefault: true }
 * DELETE /api/outreach/sender-profile/[id]  — remove a saved sender profile.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params
    const body = await req.json().catch(() => ({}))

    if (body?.makeDefault) {
      const [exists] = await sql`
        SELECT id FROM sender_profiles WHERE id = ${id} AND user_id = ${user.id}
      ` as any[]
      if (!exists) return NextResponse.json({ error: "Not found" }, { status: 404 })
      await sql`
        UPDATE sender_profiles SET is_default = (id = ${id}), updated_at = NOW()
        WHERE user_id = ${user.id}
      `
      return NextResponse.json({ ok: true, defaultId: id })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[outreach/sender-profile PATCH] error:", e)
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
      DELETE FROM sender_profiles WHERE id = ${id} AND user_id = ${user.id} RETURNING is_default
    `
    if (!deleted.length) return NextResponse.json({ error: "Not found" }, { status: 404 })

    // If we removed the default, promote the most recent remaining profile.
    if ((deleted[0] as any).is_default) {
      await sql`
        UPDATE sender_profiles SET is_default = true, updated_at = NOW()
        WHERE id = (
          SELECT id FROM sender_profiles WHERE user_id = ${user.id}
          ORDER BY updated_at DESC LIMIT 1
        )
      `
    }
    return NextResponse.json({ deleted: true })
  } catch (e: any) {
    console.error("[outreach/sender-profile DELETE] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to delete" }, { status: 500 })
  }
}
