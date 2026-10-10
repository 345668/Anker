/** POST /api/vc/raise-path/shortlist { limit? }: add the best contact at each of the top LP firms of the latest matching run to the pipeline (docs/architecture/50 §9.1). */
import { NextResponse } from "next/server"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { workspaceError } from "@/lib/auth/workspace-context"
import { addTopLps, SHORTLIST_DEFAULT, SHORTLIST_MAX } from "@/lib/vc/shortlist"
export const runtime = "nodejs"
export const maxDuration = 60
export async function POST(req: Request) {
  try {
    const scope = await requireCrmWorkspace(true)
    if (scope.persona !== "vc")
      return NextResponse.json({ error: "This is for fund workspaces." }, { status: 400 })
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown }
    const limit = Number.isInteger(body.limit)
      ? Math.min(Math.max(1, Number(body.limit)), SHORTLIST_MAX)
      : SHORTLIST_DEFAULT
    return NextResponse.json(await addTopLps({ orgId: scope.orgId, userId: scope.userId }, limit), {
      headers: { "Cache-Control": "private, no-store" },
    })
  } catch (e) {
    return workspaceError(e)
  }
}
