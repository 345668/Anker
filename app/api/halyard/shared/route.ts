import { NextResponse } from "next/server"
import { halyardContext, halyardFailure, publicSession } from "@/lib/halyard/route"
import { sharedWithMe } from "@/lib/halyard/sharing"

export const runtime = "nodejs"
/** Finished calls colleagues have shared with the signed-in person in this workspace. */
export async function GET() {
  try { const c = await halyardContext(false); return NextResponse.json({ sessions: (await sharedWithMe(c.orgId, c.userId)).map((x) => ({ ...publicSession(x.session), ownerName: x.ownerName })) }) } catch (e) { return halyardFailure(e) }
}
