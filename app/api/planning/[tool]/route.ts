import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireWorkspace, workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { validatePlanning } from "@/lib/planning/models"
async function context(tool: string, write = false) {
  const scope = await requireWorkspace(write)
  if (scope.persona !== "founder" || !["runway", "cap-table"].includes(tool)) throw new WorkspaceError("This planning tool requires a founder workspace.")
  return scope
}
export async function GET(req: NextRequest, { params }: { params: Promise<{ tool: string }> }) {
  try {
    const { tool } = await params, scope = await context(tool)
    if (req.nextUrl.searchParams.get("orgId") !== scope.orgId) throw new WorkspaceError("Workspace changed. Reload this page.", 409)
    const [record] = await sql`SELECT state, revision, updated_at FROM planning_scenarios WHERE user_id = ${scope.userId} AND org_id = ${scope.orgId} AND tool = ${tool}`
    return NextResponse.json({ record: record || null, orgId: scope.orgId, name: scope.name, canWrite: scope.canWrite })
  } catch (e) { return workspaceError(e) }
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ tool: string }> }) {
  try {
    const { tool } = await params, scope = await context(tool, true), body = await req.json()
    if (body.orgId !== scope.orgId) throw new WorkspaceError("Workspace changed. Reload before saving.", 409)
    if (!Number.isInteger(body.revision) || body.revision < -1) throw new WorkspaceError("Invalid scenario revision.", 400)
    let state
    try { state = validatePlanning(tool, body.state) } catch (e) { throw new WorkspaceError(e instanceof Error ? e.message : "Invalid assumptions.", 400) }
    const rows = body.revision === -1
      ? await sql`INSERT INTO planning_scenarios(user_id, org_id, tool, state) VALUES (${scope.userId}, ${scope.orgId}, ${tool}, ${JSON.stringify(state)}::jsonb)
          ON CONFLICT DO NOTHING RETURNING state, revision, updated_at`
      : await sql`UPDATE planning_scenarios SET state = ${JSON.stringify(state)}::jsonb, revision = revision + 1, updated_at = now()
          WHERE user_id = ${scope.userId} AND org_id = ${scope.orgId} AND tool = ${tool} AND revision = ${body.revision} RETURNING state, revision, updated_at`
    if (!rows[0]) throw new WorkspaceError("This scenario changed in another tab. Reload the saved version before saving.", 409)
    return NextResponse.json({ record: rows[0] })
  } catch (e) { return workspaceError(e) }
}
