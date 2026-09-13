import { requireCrmWorkspace as requireWorkspace, requireCrmEntry, requireCrmBoard } from "@/lib/crm/workspace"
/**
 * PATCH  /api/crm/views/[id] — rename / update filters
 * DELETE /api/crm/views/[id]
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

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : null
  const hasFilters = body.filters && typeof body.filters === "object"
  const json = hasFilters ? JSON.stringify(body.filters) : null
  if (json && json.length > 8192) return NextResponse.json({ error: "filters too large" }, { status: 400 })

  const rows = await sql`
    update crm_saved_views set
      name    = coalesce(${name}, name),
      filters = coalesce(${json}::jsonb, filters)
    where id = ${id}::uuid and org_id = ${scope.orgId} AND user_id = ${user.id}
    returning id, name, filters, position, created_at
  ` as Array<Record<string, unknown>>
  if (!rows.length) return NextResponse.json({ error: "View not found" }, { status: 404 })
  return NextResponse.json({ ok: true, view: rows[0] })
  } catch (error) { return workspaceError(error) }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
  const scope = await requireWorkspace(true)
    const user = { id: scope.userId }
  const { id } = await ctx.params
  const rows = await sql`
    delete from crm_saved_views where id = ${id}::uuid and org_id = ${scope.orgId} AND user_id = ${user.id} returning id
  ` as Array<{ id: string }>
  if (!rows.length) return NextResponse.json({ error: "View not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
  } catch (error) { return workspaceError(error) }
}
