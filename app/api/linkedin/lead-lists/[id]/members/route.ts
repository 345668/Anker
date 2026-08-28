/**
 * /api/linkedin/lead-lists/[id]/members — add + remove leads.
 *   POST   → { ok, added }   { blob?: string } (CSV/paste) or { people?: AddLeadInput[] }
 *   DELETE ?memberId=…       → { ok }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { addLeadListMembers, removeLeadListMember, parseLeadBlob } from "@/lib/linkedin/lead-lists"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const people = Array.isArray(body.people) ? body.people : typeof body.blob === "string" ? parseLeadBlob(body.blob) : []
  try {
    return NextResponse.json({ ok: true, added: await addLeadListMembers(auth.id, id, people) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to add leads" }, { status: 400 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const memberId = new URL(req.url).searchParams.get("memberId") || ""
  if (!memberId) return NextResponse.json({ ok: false, error: "memberId required" }, { status: 400 })
  const ok = await removeLeadListMember(auth.id, id, memberId)
  if (!ok) return NextResponse.json({ ok: false, error: "Lead not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
