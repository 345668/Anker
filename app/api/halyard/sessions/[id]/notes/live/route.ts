import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure, inWorkspaceAi } from "@/lib/halyard/route"
import { refreshLiveNotes } from "@/lib/halyard/notes"

export const runtime = "nodejs"
export const maxDuration = 60
/** The open room asks now and then; the server decides whether an update is due (at least 8 new turns and a minute since the last) and never touches a person's own edit. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const c = await sessionContext((await params).id); return NextResponse.json(await inWorkspaceAi(c, req.signal, () => refreshLiveNotes(c.session))) } catch (e) { return halyardFailure(e) }
}
