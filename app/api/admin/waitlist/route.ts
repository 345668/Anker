/**
 * GET  /api/admin/waitlist?status=&page=
 *   → { rows, counts, hasMore, page, status, ttl:{default,min,max} }
 *
 * POST /api/admin/waitlist
 *   { id: string, action: "approve"|"decline"|"invite"|"revoke", ttlDays?: number }
 *   → { ok, message }
 *
 * Admin-gated, and reachable by the staff portal through its service bearer —
 * this is the surface SAIL's /api/anker relay forwards to. Both front ends call
 * lib/marketing/waitlist-admin.ts, so the lifecycle rules cannot drift between
 * the owner console and the portal.
 *
 * "invite" sends real email to a real applicant, so it is POST only and takes
 * no bulk form: each send is one deliberate act against one named request.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { isWaitlistAction, listRequests, runWaitlistAction } from "@/lib/marketing/waitlist-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const params = req.nextUrl.searchParams
  try {
    return NextResponse.json(await listRequests({ page: params.get("page"), status: params.get("status") }))
  } catch (e) {
    console.error("[admin/waitlist] list failed", e)
    return NextResponse.json({ error: "The waitlist could not be read. Check the invitations migration." }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()
    const action = body?.action
    const id = typeof body?.id === "string" ? body.id.trim() : ""
    if (!isWaitlistAction(action)) {
      return NextResponse.json({ error: "Unknown action. Use approve, decline, invite or revoke." }, { status: 400 })
    }
    if (!id) return NextResponse.json({ error: "A request id is required." }, { status: 400 })
    const result = await runWaitlistAction(action, id, { ttlDays: body?.ttlDays })
    // A refusal here is a state conflict (already accepted, nothing to revoke),
    // not a malformed request — 409 so the portal can tell them apart.
    return NextResponse.json(result, { status: result.ok ? 200 : 409 })
  } catch (e) {
    console.error("[admin/waitlist] action failed", e)
    return NextResponse.json({ error: "The action could not be completed." }, { status: 500 })
  }
}
