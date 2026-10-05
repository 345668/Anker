/** GET /api/agents — the agents this workspace can run, its switches, and recent runs. */
import { NextResponse } from "next/server"
import { requireWorkspace, workspaceError } from "@/lib/auth/workspace-context"
import { definitionsFor } from "@/lib/agents/runtime/definitions"
import { getSettings, listExecutions } from "@/lib/agents/runtime/engine"

export const runtime = "nodejs"

export async function GET() {
  try {
    const scope = await requireWorkspace(false)
    const [settings, executions] = await Promise.all([getSettings(scope.orgId), listExecutions(scope.orgId)])
    const agents = definitionsFor(scope.persona).map((d) => ({ id: d.id, title: d.title, summary: d.summary, schedule: d.schedule, triggers: d.triggers ?? [], usesModel: !!d.usesModel, maxSpendUsd: d.maxSpendUsd, guarantees: d.guarantees, defaults: d.defaults,
      enabled: !!settings[d.id]?.enabled, config: settings[d.id]?.config ?? {} }))
    return NextResponse.json({ agents, executions, canRun: scope.canWrite, canManage: ["workspace_owner", "admin"].includes(scope.role) })
  } catch (e) { return workspaceError(e) }
}
