/** POST /api/outreach/send-authorizations/<id>/revoke { reason? } — stop what has not gone. Sent mail cannot be recalled and is reported, not claimed undone. */
import { NextRequest, NextResponse } from "next/server"
import { requireRevoker } from "@/lib/outreach/send-auth/session"
import { revokeAuthorization, AuthorizationError } from "@/lib/outreach/send-auth/store"
import { sql } from "@/lib/db"

export const runtime = "nodejs"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const who = await requireRevoker()
  if (who instanceof NextResponse) return who
  const id = (await ctx.params).id
  const [a] = (await sql`SELECT sender_user_id FROM send_authorizations WHERE id = ${id} AND org_id = ${who.orgId}`) as any[]
  if (!a) return NextResponse.json({ error: "Authorization not found." }, { status: 404 })
  if (a.sender_user_id !== who.userId && !["workspace_owner", "admin"].includes(who.role)) return NextResponse.json({ error: "Only the sender, or a workspace owner or admin, can revoke this." }, { status: 403 })
  const b = await req.json().catch(() => ({}))
  try {
    const r = await revokeAuthorization(who.orgId, id, { userId: who.userId, email: who.email }, typeof b?.reason === "string" ? b.reason : "revoked by " + (who.email ?? "a person"))
    return NextResponse.json({ ok: true, ...r, message: `${r.revoked} not yet sent were stopped.${r.alreadySent ? ` ${r.alreadySent} had already gone and cannot be recalled.` : ""}${r.inFlight ? ` ${r.inFlight} were being sent at that moment.` : ""}` })
  } catch (e) { if (e instanceof AuthorizationError) return NextResponse.json({ error: e.message }, { status: e.status }); throw e }
}
