/** POST /api/vc/raise-path/linkedin: queue the saved first-wave LinkedIn messages as connection requests in the Review Queue, pending approval (docs/architecture/50 §9.2). */
import { NextResponse } from "next/server"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { workspaceError } from "@/lib/auth/workspace-context"
import { queueLinkedIn } from "@/lib/vc/linkedin-wave"
export const runtime = "nodejs"
export const maxDuration = 60
export async function POST() {
  try {
    const scope = await requireCrmWorkspace(true)
    if (scope.persona !== "vc")
      return NextResponse.json({ error: "This is for fund workspaces." }, { status: 400 })
    return NextResponse.json(await queueLinkedIn({ orgId: scope.orgId, userId: scope.userId }), {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (e) {
    return workspaceError(e)
  }
}
