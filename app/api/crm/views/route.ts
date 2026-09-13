import { requireCrmWorkspace as requireWorkspace, requireCrmEntry, requireCrmBoard } from "@/lib/crm/workspace"
/**
 * /api/crm/views — named saved views (filter presets).
 *
 *   GET                       list
 *   POST { name, filters }    create (filters: arbitrary JSON, capped 8KB)
 *
 * A view stores the whole filter bar state: { q, stages[], tiers[],
 * minScore, tags[], staleDays, boardId, sort }.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"

export const runtime = "nodejs"

export async function GET() {
  try {
  const scope = await requireWorkspace(false)
    const user = { id: scope.userId }
  const rows = await sql`
    select id, name, filters, position, created_at
    from crm_saved_views
    where org_id = ${scope.orgId} AND user_id = ${user.id}
    order by position asc nulls last, created_at asc
  `
  return NextResponse.json({ views: rows })
  } catch (error) { return workspaceError(error) }
}

export async function POST(req: NextRequest) {
  try {
  const scope = await requireWorkspace(true)
    const user = { id: scope.userId }

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : ""
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 })
  const filters = body.filters && typeof body.filters === "object" ? body.filters : {}
  const json = JSON.stringify(filters)
  if (json.length > 8192) return NextResponse.json({ error: "filters too large" }, { status: 400 })

  const rows = await sql`
    insert into crm_saved_views (org_id, user_id, name, filters)
    values (${scope.orgId}, ${user.id}, ${name}, ${json}::jsonb)
    returning id, name, filters, position, created_at
  ` as Array<Record<string, unknown>>
  return NextResponse.json({ ok: true, view: rows[0] }, { status: 201 })
  } catch (error) { return workspaceError(error) }
}
