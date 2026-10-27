import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure } from "@/lib/halyard/route"
import { proposeFollowupDraft } from "@/lib/halyard/finish"
import { requireWorkspace } from "@/lib/auth/workspace-context"
import type { CallScope } from "@/lib/calls/access"

export const runtime = "nodejs"
/** Proposes saving the follow-up email as an outreach draft. It appears in the actions inbox for approval; nothing is saved or sent by this request. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await sessionContext((await params).id), w = await requireWorkspace(true)
    return NextResponse.json(await proposeFollowupDraft(c.session, { userId: c.userId, orgId: c.orgId, persona: w.persona as CallScope["persona"], writable: true, workspace: w.name }))
  } catch (e) { return halyardFailure(e) }
}
