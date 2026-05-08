/**
 * POST /api/agents/run
 *   { crmEntryId, mode?, founder?, force? }
 *
 * Runs the outreach orchestrator on one CRM entry.
 * Admin OR the entry's owner can trigger.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { runAgent } from "@/lib/agents/outreach-agent"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    const body = await req.json()
    if (!body?.crmEntryId) return NextResponse.json({ error: "crmEntryId required" }, { status: 400 })

    const [entry] = await sql`SELECT user_id FROM crm_entries WHERE id = ${body.crmEntryId} LIMIT 1`
    if (!entry) return NextResponse.json({ error: "Entry not found" }, { status: 404 })
    const meta = (user.user_metadata ?? {}) as Record<string, any>
    const isAdmin = meta.role === "admin"
    if (!isAdmin && (entry as any).user_id !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const result = await runAgent({
      crmEntryId: String(body.crmEntryId),
      mode: body.mode,
      founder: body.founder,
      force: !!body.force,
    })
    return NextResponse.json(result)
  } catch (e: any) {
    console.error("[agents/run] error:", e)
    return NextResponse.json({ error: e?.message ?? "agent failed" }, { status: 500 })
  }
}
