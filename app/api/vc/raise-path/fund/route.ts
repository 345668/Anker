/** POST /api/vc/raise-path/fund: create the fund profile or fill the lines that were typed, nothing else (docs/architecture/50 §9.3). */
import { NextResponse } from "next/server"
import { ZodError } from "zod"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { workspaceError } from "@/lib/auth/workspace-context"
import { QuickFundError, quickFundSchema, saveQuickFund } from "@/lib/vc/fund-quick"
export const runtime = "nodejs"
export async function POST(req: Request) {
  try {
    const scope = await requireCrmWorkspace(true)
    if (scope.persona !== "vc")
      return NextResponse.json({ error: "This is for fund workspaces." }, { status: 400 })
    const raw = (await req.json().catch(() => ({}))) as Record<string, unknown>
    // Empty boxes are "not typed", not "set to empty".
    const cleaned = Object.fromEntries(
      Object.entries(raw).filter(([, v]) => v !== "" && v !== null && v !== undefined),
    )
    return NextResponse.json(
      await saveQuickFund({ orgId: scope.orgId, userId: scope.userId }, quickFundSchema.parse(cleaned)),
      { headers: { "Cache-Control": "private, no-store" } },
    )
  } catch (e) {
    if (e instanceof ZodError)
      return NextResponse.json({ error: e.issues[0]?.message || "Check the fields." }, { status: 422 })
    if (e instanceof QuickFundError) return NextResponse.json({ error: e.message }, { status: e.status })
    return workspaceError(e)
  }
}
