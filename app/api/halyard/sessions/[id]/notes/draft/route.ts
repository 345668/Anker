import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure, inWorkspaceAi } from "@/lib/halyard/route"
import { draftNotes } from "@/lib/halyard/notes"

export const runtime = "nodejs"
export const maxDuration = 120
/** Drafts notes from the whole transcript. If the person has edited the notes, the draft comes back beside them and is NOT saved over them. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const c = await sessionContext((await params).id); return NextResponse.json(await inWorkspaceAi(c, req.signal, () => draftNotes(c.session))) } catch (e) { return halyardFailure(e) }
}
