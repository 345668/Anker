import { requireCrmWorkspace as requireWorkspace, requireCrmEntry, requireCrmBoard } from "@/lib/crm/workspace"
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
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const scope = await requireWorkspace(true)
    const user = { id: scope.userId }

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
      WHERE id = ${id} AND org_id = ${scope.orgId}
      RETURNING *
    `
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 })
    return NextResponse.json({ board: {
      id: updated.id, name: updated.name, position: updated.position,
      isDefault: !!updated.is_default, archived: !!updated.archived,
      sourceSessionId: updated.source_session_id ?? null,
    } })
  } catch (e: any) {
    if (e instanceof WorkspaceError) return workspaceError(e)
    console.error("[crm/boards PATCH] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to update board" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const scope = await requireWorkspace(true)
    const user = { id: scope.userId }

    const { id } = await ctx.params

    const [board] = await sql`
      SELECT * FROM crm_boards WHERE id = ${id} AND org_id = ${scope.orgId}
    ` as any[]
    if (!board) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (board.is_default) {
      return NextResponse.json({ error: "Can't delete your default board. Rename it instead." }, { status: 400 })
    }

    const [round] = await sql`SELECT id FROM fundraising_rounds WHERE board_id=${id} LIMIT 1`
    if (round) throw new WorkspaceError("This board belongs to a fundraising round. Archive it instead of deleting it.",409)

    // Reassign this board's entries to the default board (keep the rows).
    const [fallback] = await sql`
      SELECT id FROM crm_boards
      WHERE org_id = ${scope.orgId} AND is_default = true AND id <> ${id}
      ORDER BY created_at ASC LIMIT 1
    ` as any[]
    const fallbackId = fallback?.id ?? null

    const [result] = await sql`WITH moved AS (
      UPDATE crm_entries SET board_id=${fallbackId},updated_at=now()
      WHERE org_id=${scope.orgId} AND board_id=${id} RETURNING id
    ), deleted AS (
      DELETE FROM crm_boards WHERE id=${id} AND org_id=${scope.orgId} RETURNING id
    ) SELECT (SELECT count(*)::int FROM moved) AS moved, (SELECT count(*)::int FROM deleted) AS deleted`
    return NextResponse.json({ deleted: !!result.deleted, movedEntries: result.moved, movedTo: fallbackId })

  } catch (e: any) {
    if (e instanceof WorkspaceError) return workspaceError(e)
    console.error("[crm/boards DELETE] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to delete board" }, { status: 500 })
  }
}
