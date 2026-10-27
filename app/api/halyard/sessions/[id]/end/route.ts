import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure, inWorkspaceAi, publicSession } from "@/lib/halyard/route"
import { finishSession } from "@/lib/halyard/finish"
import { requireWorkspace } from "@/lib/auth/workspace-context"
import type { CallScope } from "@/lib/calls/access"

export const runtime = "nodejs"
export const maxDuration = 120
/** Ends the session, makes the call record, drafts the notes, runs the analysis and makes proposals (never writes). Returns what was done and what was not. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await sessionContext((await params).id), w = await requireWorkspace(true)
    const scope: CallScope = { userId: c.userId, orgId: c.orgId, persona: w.persona as CallScope["persona"], writable: true, workspace: w.name }
    const r = await inWorkspaceAi(c, req.signal, () => finishSession(c.session, scope))
    return NextResponse.json({ session: publicSession(r.session), callId: r.callId, notes: r.notes, analysis: r.analysis, proposals: r.proposals, truncatedInCall: r.truncatedInCall, warnings: r.warnings })
  } catch (e) { return halyardFailure(e) }
}
