import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

/** GET → the current user's tasks (assignee), ordered by due date. */
export async function GET() {
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch { /* ignore */ }
  if (!userId) return NextResponse.json({ tasks: [] })

  const tasks = await sql`
    SELECT id, title, entity_label, stage, priority, to_char(due_date, 'YYYY-MM-DD') AS due_date
    FROM tasks
    WHERE assignee_id = ${userId}
    ORDER BY (stage = 'done'), due_date ASC NULLS LAST
  `
  return NextResponse.json({ tasks })
}
