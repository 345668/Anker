/**
 * PATCH  /api/crm/boards/[id]  — rename / reorder / archive a board.
 *                                 Body: { name?, position?, archived? }
 * DELETE /api/crm/boards/[id]  — delete a board.  Its entries are NOT
 *                                 deleted; they are reassigned to the
 *                                 user's default board (or left
 *                                 unassigned if none).  The default board
 *                                 cannot be deleted.
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
    const name = body?.name !== undefined ? String(body.name).trim() : undefined
    const position = body?.position !== undefined ? Number(body.position) : undefined
    const archived = body?.archived !== undefined ? Boolean(body.archived) : undefined

    if (name !== undefined && !name) {
      return NextResponse.json({ error: "name cannot be empty" }, { status: 400 })
    }

    const [updated] = await sql`
      UPDATE crm_boards SET
        name       = COALESCE(${name ?? null}, name),
        position   = COALESCE(${position ?? null}::int, position),
        archived   = COALESCE(${archived ?? null}::boolean, archived),
        updated_at = NOW()
      WHERE id = ${id} AND user_id = ${user.id}
      RETURNING *
    `
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ board: {
      id: updated.id, name: updated.name, position: updated.position,
      isDefault: !!updated.is_default, archived: !!updated.archived,
      sourceSessionId: updated.source_session_id ?? null,
    } })
  } catch (e: any) {
    console.error("[crm/boards PATCH] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to update board" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const { id } = await ctx.params

    const [board] = await sql`
      SELECT * FROM crm_boards WHERE id = ${id} AND user_id = ${user.id}
    ` as any[]
    if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (board.is_default) {
      return NextResponse.json({ error: "Can't delete your default board. Rename it instead." }, { status: 400 })
    }

    // Reassign this board's entries to the default board (keep the rows).
    const [fallback] = await sql`
      SELECT id FROM crm_boards
      WHERE user_id = ${user.id} AND is_default = true AND id <> ${id}
      ORDER BY created_at ASC LIMIT 1
    ` as any[]
    const fallbackId = fallback?.id ?? null

    const moved = await sql`
      UPDATE crm_entries SET board_id = ${fallbackId}, updated_at = NOW()
      WHERE user_id = ${user.id} AND board_id = ${id}
      RETURNING id
    `
    await sql`DELETE FROM crm_boards WHERE id = ${id} AND user_id = ${user.id}`

    return NextResponse.json({ deleted: true, movedEntries: moved.length, movedTo: fallbackId })
  } catch (e: any) {
    console.error("[crm/boards DELETE] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to delete board" }, { status: 500 })
  }
}
