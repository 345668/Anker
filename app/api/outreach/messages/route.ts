/**
 * GET /api/outreach/messages?crmEntryId=...
 *   List the 4 (or fewer) outreach messages for one CRM entry, sorted
 *   by step number ascending.
 *
 * GET /api/outreach/messages?status=queued&limit=50
 *   List queued / approved messages for the worker to send.
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

    const url = new URL(req.url)
    const crmEntryId = url.searchParams.get("crmEntryId")
    const status = url.searchParams.get("status")
    const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 200) || 200)

    let rows: any[]
    if (crmEntryId) {
      rows = await sql`
        SELECT * FROM outreach_messages
        WHERE user_id = ${user.id} AND crm_entry_id = ${crmEntryId}
        ORDER BY step_number ASC
      `
    } else if (status) {
      rows = await sql`
        SELECT * FROM outreach_messages
        WHERE user_id = ${user.id} AND status = ${status}
        ORDER BY scheduled_for ASC NULLS LAST, created_at ASC
        LIMIT ${limit}
      `
    } else {
      rows = await sql`
        SELECT * FROM outreach_messages
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    }
    return NextResponse.json({ messages: rows })
  } catch (e: any) {
    console.error("[outreach/messages GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to load" }, { status: 500 })
  }
}
