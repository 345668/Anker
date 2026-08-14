import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

/** PATCH { stepKey, status } → mark a step done/todo and recompute report status. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let userId: string | null = null
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    userId = user?.id ?? null
  } catch { /* ignore */ }
  if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const { id } = await params
  let stepKey = "", status = ""
  try {
    const body = await req.json()
    stepKey = String(body?.stepKey ?? "")
    status = String(body?.status ?? "")
  } catch { /* ignore */ }
  if (!stepKey || !["done", "todo"].includes(status)) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const rows = await sql`SELECT steps FROM financial_reports WHERE id = ${id} LIMIT 1`
  if (!rows.length) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const steps = (rows[0].steps as any[]).map((s) =>
    s.key === stepKey
      ? { ...s, status, completedAt: status === "done" ? new Date().toISOString().slice(0, 10) : null, completedBy: status === "done" ? "You" : null }
      : s,
  )
  const reportStatus = steps.every((s) => s.status === "done") ? "done" : "needs_review"

  await sql`
    UPDATE financial_reports
    SET steps = ${JSON.stringify(steps)}::jsonb, status = ${reportStatus}, updated_at = now()
    WHERE id = ${id}
  `
  return NextResponse.json({ ok: true, status: reportStatus })
}
