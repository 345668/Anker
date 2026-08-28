/**
 * PUT /api/linkedin/lead-lists/[id]/share — share (or un-share) with a workspace.
 * Body: { orgId: string | null }   // null un-shares
 * → { ok, list }   owner-only
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { shareLeadList } from "@/lib/linkedin/lead-lists"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const orgId = typeof body.orgId === "string" && body.orgId ? body.orgId : null
  try {
    const list = await shareLeadList(auth.id, id, orgId)
    if (!list) return NextResponse.json({ ok: false, error: "List not found" }, { status: 404 })
    return NextResponse.json({ ok: true, list })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to share" }, { status: 400 })
  }
}
