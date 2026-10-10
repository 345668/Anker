/** GET /api/vc/raise-path: where this fund workspace is on the way to a first approved wave of LP outreach (docs/architecture/50). */
import { NextResponse } from "next/server"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { workspaceError } from "@/lib/auth/workspace-context"
import { raiseState } from "@/lib/vc/raise-path"
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET() {
  try {
    const scope = await requireCrmWorkspace(false)
    if (scope.persona !== "vc") return NextResponse.json({ applicable: false })
    return NextResponse.json(await raiseState(scope.orgId, scope.userId), {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (e) {
    return workspaceError(e)
  }
}
