/**
 * /api/linkedin/campaigns/[id]/members — enroll + remove people.
 *   POST   → { ok, added }   { people: [{ targetUrl, targetName?, crmEntryId? }, …] }
 *   DELETE ?memberId=…       → { ok }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { enrollMembers, removeMember } from "@/lib/linkedin/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const people = Array.isArray(body.people) ? body.people : []
  try {
    return NextResponse.json({ ok: true, added: await enrollMembers(auth.id, id, people) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to enroll" }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const memberId = new URL(req.url).searchParams.get("memberId") || ""
  if (!memberId) return NextResponse.json({ ok: false, error: "memberId required" }, { status: 400 })
  const ok = await removeMember(auth.id, id, memberId)
  if (!ok) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
