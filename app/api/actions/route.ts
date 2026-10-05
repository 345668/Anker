/** GET /api/actions?tab=pending|history — this workspace's proposals and autonomy setting. */
import { NextRequest, NextResponse } from "next/server"
import { requireWorkspace, workspaceError } from "@/lib/auth/workspace-context"
import { listProposals, getAutonomy } from "@/lib/actions/store"

export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  try {
    const scope = await requireWorkspace(false)
    const tab = req.nextUrl.searchParams.get("tab") === "history" ? "history" : "pending"
    const [proposals, autonomy] = await Promise.all([listProposals(scope.orgId, tab), getAutonomy(scope.orgId)])
    return NextResponse.json({ proposals, autonomy, canDecide: scope.canWrite && ["workspace_owner", "admin", "member"].includes(scope.role), canSetAutonomy: ["workspace_owner", "admin"].includes(scope.role) })
  } catch (e) { return workspaceError(e) }
}
