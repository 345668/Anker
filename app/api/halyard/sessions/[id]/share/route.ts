import { NextRequest, NextResponse } from "next/server"
import { sessionContext as ctx, halyardFailure } from "@/lib/halyard/route"
import { HalyardError } from "@/lib/halyard/sessions"
/** Sharing is decided in the web app by the person, never by a paired desktop key. */
async function sessionContext(id: string) { const c = await ctx(id); if (c.via === "device") throw new HalyardError("Share a call from the web app.", 403, "browser_only"); return c }
import { listMembers, listShares, shareSession, unshareSession } from "@/lib/halyard/sharing"

export const runtime = "nodejs"
type P = { params: Promise<{ id: string }> }
/** Owner only: who it is shared with, and the colleagues it could be shared with. */
export async function GET(_r: NextRequest, { params }: P) {
  try { const c = await sessionContext((await params).id); return NextResponse.json({ shared: await listShares(c.session.id), members: await listMembers(c.orgId, c.userId), canShare: c.session.state !== "abandoned" }) } catch (e) { return halyardFailure(e) }
}
/** { userId } — share the finished call with a colleague in this workspace. */
export async function POST(req: NextRequest, { params }: P) {
  try { const c = await sessionContext((await params).id), b = await req.json(); await shareSession(c.session, String(b?.userId ?? "")); return NextResponse.json({ shared: await listShares(c.session.id) }) } catch (e) { return halyardFailure(e) }
}
/** { userId } — withdraw access. */
export async function DELETE(req: NextRequest, { params }: P) {
  try { const c = await sessionContext((await params).id), b = await req.json(); await unshareSession(c.session, String(b?.userId ?? "")); return NextResponse.json({ shared: await listShares(c.session.id) }) } catch (e) { return halyardFailure(e) }
}
