/**
 * GET  /api/updates  — list the user's investor updates + engagement rollups.
 * POST /api/updates  — AI-draft a new update. body: { period?, highlights?, metrics? }
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireUpdateWorkspace } from "@/lib/updates/workspace"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { draftUpdate } from "@/lib/updates/builder"

export const runtime = "nodejs"
export const maxDuration = 120

export async function GET() {
  try {
  const scope = await requireUpdateWorkspace(false, false)
  const user = { id: scope.userId }
  const rows = await sql`
    SELECT u.id, u.title, u.period, u.status, u.created_at, u.sent_at,
           count(r.id)::int AS recipients,
           count(r.id) FILTER (WHERE r.opened_at IS NOT NULL)::int AS opened
    FROM investor_updates u
    LEFT JOIN investor_update_recipients r ON r.update_id = u.id
    WHERE u.org_id = ${scope.orgId}
    GROUP BY u.id
    ORDER BY u.created_at DESC LIMIT 100
  `
  return NextResponse.json({ updates: rows, canWrite: scope.canWrite, canSend: scope.canWrite && scope.canSendOutreach, orgId: scope.orgId, workspace: scope.name })
  } catch (error) { return workspaceError(error) }
}

export async function POST(req: NextRequest) {
  try {
  const scope = await requireUpdateWorkspace(true, false)
  const user = { id: scope.userId }
  const body = await req.json().catch(() => ({}))
  const drafted = await draftUpdate(scope.orgId, {
    period: typeof body?.period === "string" ? body.period : undefined,
    highlights: typeof body?.highlights === "string" ? body.highlights : undefined,
    metrics: Array.isArray(body?.metrics) ? body.metrics : undefined,
  })
  const [row] = (await sql`
    INSERT INTO investor_updates (org_id, user_id, title, period, body, metrics, asks, status, generated_by, created_at, updated_at)
    VALUES (${scope.orgId}, ${user.id}, ${drafted.title}, ${body?.period ?? null}, ${drafted.body},
            ${JSON.stringify(drafted.metrics)}::jsonb, ${drafted.asks}, 'draft', ${drafted.generatedBy}, NOW(), NOW())
    RETURNING *
  `) as any[]
  return NextResponse.json({ update: row })
  } catch (error) { return workspaceError(error) }
}
