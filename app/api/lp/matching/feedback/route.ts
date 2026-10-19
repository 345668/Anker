import { NextRequest, NextResponse } from "next/server"
import { requireCrmWorkspace } from "@/lib/crm/workspace"
import { workspaceError } from "@/lib/auth/workspace-context"
import { clearExclusion, FeedbackError, recordFeedback } from "@/lib/matching/lp/feedback"

/** A verdict on one suggested LP, optionally "never suggest again"; or {undoExclusion:true} to lift that. */
export async function POST(req: NextRequest) {
  try {
    const scope = await requireCrmWorkspace(true)
    if (scope.persona !== "vc") return NextResponse.json({ error: "Switch to a fund workspace." }, { status: 403 })
    const b = await req.json()
    const kind = b?.kind === "contact" ? "contact" : b?.kind === "firm" ? "firm" : null
    if (!kind || !b?.matchId) return NextResponse.json({ error: "Say which match." }, { status: 400 })
    if (b.undoExclusion) return NextResponse.json({ ok: true, cleared: await clearExclusion(scope, kind, String(b.matchId)) })
    const r = await recordFeedback(scope, { kind, matchId: String(b.matchId), verdict: b.verdict, reason: b.reason ?? null, note: b.note ?? null, neverAgain: !!b.neverAgain })
    return NextResponse.json({ ok: true, ...r })
  } catch (error) {
    if (error instanceof FeedbackError) return NextResponse.json({ error: error.message }, { status: error.status })
    return workspaceError(error)
  }
}
