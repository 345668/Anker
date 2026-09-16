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
import { crmWorkspaceResponse } from "@/lib/crm/workspace"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
    // A message inherits its workspace from the CRM entry it belongs to.
    // Filtering on user_id alone let someone with several workspaces read
    // messages from a workspace other than the active one.
    const crmScope = await crmWorkspaceResponse(false)
    if (crmScope instanceof NextResponse) return crmScope

    const url = new URL(req.url)
    const crmEntryId = url.searchParams.get("crmEntryId")
    const status = url.searchParams.get("status")
    const limit = Math.min(500, Number(url.searchParams.get("limit") ?? 200) || 200)

    // Every branch joins crm_entries so the active workspace bounds the result,
    // matching requireCrmEntry: a record whose entry is not in this workspace
    // is simply not visible here.
    let rows: any[]
    if (crmEntryId) {
      rows = await sql`
        SELECT m.* FROM outreach_messages m
        JOIN crm_entries e ON e.id = m.crm_entry_id AND e.org_id = ${crmScope.orgId}
        WHERE m.user_id = ${user.id} AND m.crm_entry_id = ${crmEntryId}
        ORDER BY m.step_number ASC
      `
    } else if (status) {
      rows = await sql`
        SELECT m.* FROM outreach_messages m
        JOIN crm_entries e ON e.id = m.crm_entry_id AND e.org_id = ${crmScope.orgId}
        WHERE m.user_id = ${user.id} AND m.status = ${status}
        ORDER BY m.scheduled_for ASC NULLS LAST, m.created_at ASC
        LIMIT ${limit}
      `
    } else {
      rows = await sql`
        SELECT m.* FROM outreach_messages m
        JOIN crm_entries e ON e.id = m.crm_entry_id AND e.org_id = ${crmScope.orgId}
        WHERE m.user_id = ${user.id}
        ORDER BY m.created_at DESC
        LIMIT ${limit}
      `
    }
    return NextResponse.json({ messages: rows })
  } catch (e: any) {
    console.error("[outreach/messages GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "Failed to load" }, { status: 500 })
  }
}
