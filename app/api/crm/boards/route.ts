/**
 * GET  /api/crm/boards   — list the current user's CRM boards ("CRM sessions")
 *                          with a live entry count per board.
 * POST /api/crm/boards   — create a new empty board { name }.
 *
 * Boards are the named, switchable, renameable workspaces the CRM grid
 * tabs across.  Matchmaking runs auto-create a board (see the
 * crm_boards migration backfill + import-shortlist); the user can also
 * create empty ones here and move rows in.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

function serialize(b: any, count = 0) {
  return {
    id: b.id,
    name: b.name,
    sourceSessionId: b.source_session_id ?? null,
    position: b.position ?? null,
    isDefault: !!b.is_default,
    archived: !!b.archived,
    count,
    createdAt: b.created_at ? new Date(b.created_at).toISOString() : null,
    updatedAt: b.updated_at ? new Date(b.updated_at).toISOString() : null,
  }
}

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const boards = await sql`
      SELECT * FROM crm_boards
      WHERE user_id = ${user.id} AND archived = false
      ORDER BY position ASC NULLS LAST, created_at ASC
    `
    const counts = await sql`
      SELECT board_id, COUNT(*)::int AS n
      FROM crm_entries
      WHERE user_id = ${user.id}
      GROUP BY board_id
    `
    const countMap: Record<string, number> = {}
    let unassigned = 0
    for (const c of counts as any[]) {
      if (c.board_id == null) unassigned = Number(c.n) || 0
      else countMap[String(c.board_id)] = Number(c.n) || 0
    }

    return NextResponse.json({
      boards: (boards as any[]).map((b) => serialize(b, countMap[b.id] ?? 0)),
      unassigned,
    })
  } catch (e: any) {
    console.error("[crm/boards GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to load boards" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const name = String(body?.name ?? "").trim() || "Untitled CRM"

    // Next position = max + 1 so new boards land on the right of the tab bar.
    const [{ next_pos } = { next_pos: 0 }] = await sql`
      SELECT COALESCE(MAX(position), -1) + 1 AS next_pos
      FROM crm_boards WHERE user_id = ${user.id}
    ` as any[]

    // First board for a user becomes their default.
    const [{ n } = { n: 0 }] = await sql`
      SELECT COUNT(*)::int AS n FROM crm_boards WHERE user_id = ${user.id}
    ` as any[]
    const isDefault = Number(n) === 0

    const [board] = await sql`
      INSERT INTO crm_boards (user_id, name, position, is_default, created_at, updated_at)
      VALUES (${user.id}, ${name}, ${next_pos}, ${isDefault}, NOW(), NOW())
      RETURNING *
    `
    return NextResponse.json({ board: serialize(board, 0) }, { status: 201 })
  } catch (e: any) {
    console.error("[crm/boards POST] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to create board" }, { status: 500 })
  }
}
