import { NextRequest, NextResponse } from "next/server"
import { sessionContext, halyardFailure, publicSession } from "@/lib/halyard/route"
import { endSession } from "@/lib/halyard/sessions"

export const runtime = "nodejs"
/** Ends the session and sets its retention date. The call row, notes and analysis are slice H5. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const { session } = await sessionContext((await params).id); return NextResponse.json({ session: publicSession(await endSession(session)) }) } catch (e) { return halyardFailure(e) }
}
