import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure, inWorkspaceAi } from "@/lib/halyard/route"
import { draftEmailFromNotes } from "@/lib/halyard/notes"

export const runtime = "nodejs"
export const maxDuration = 60
/** A follow-up email draft from the saved notes. A draft only: nothing is sent. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const c = await sessionContext((await params).id); return NextResponse.json({ notes: await inWorkspaceAi(c, req.signal, () => draftEmailFromNotes(c.session)) }) } catch (e) { return halyardFailure(e) }
}
