import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

const STAGES = ["to_do", "in_progress", "review", "done"]

/** PATCH { stage } → move a task the current user owns to a new stage. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch { /* ignore */ }
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { id } = await params
  let stage = ""
  try { stage = String((await req.json())?.stage ?? "") } catch { /* ignore */ }
  if (!STAGES.includes(stage)) return NextResponse.json({ error: "Invalid stage" }, { status: 400 })

  const updated = await sql`
    UPDATE tasks SET stage = ${stage}, updated_at = now()
    WHERE id = ${id} AND assignee_id = ${userId}
    RETURNING id
  `
  if (!updated.length) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
