import { NextRequest, NextResponse } from "next/server"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { workspaceError } from "@/lib/auth/workspace-context"
import { addMatchesToCrm, draftIntros, MatchActionError } from "@/lib/matching/lp/actions"

export const maxDuration = 120

/** What a person does with chosen LPs: {action:"add_to_crm"|"draft_intros", sessionId, refs:[{kind,id}]}. Nothing here sends anything. */
export async function POST(req: NextRequest) {
  try {
    const scope = await requireCrmWorkspace(true)
    if (scope.persona !== "vc") return NextResponse.json({ error: "Switch to a fund workspace." }, { status: 403 })
    const b = await req.json()
    const sessionId = String(b?.sessionId ?? "")
    const refs = (Array.isArray(b?.refs) ? b.refs : []).map((r: any) => ({ kind: r?.kind === "contact" ? "contact" : "firm", id: String(r?.id ?? "") })).filter((r: any) => r.id)
    if (!sessionId || !refs.length) return NextResponse.json({ error: "Choose at least one LP." }, { status: 400 })
    if (b.action === "add_to_crm") return NextResponse.json({ ok: true, ...(await addMatchesToCrm(scope, sessionId, refs)) })
    if (b.action === "draft_intros") return NextResponse.json({ ok: true, ...(await draftIntros({ ...scope, persona: scope.persona }, sessionId, refs)) })
    return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  } catch (error) {
    if (error instanceof MatchActionError) return NextResponse.json({ error: error.message }, { status: error.status })
    return workspaceError(error)
  }
}
