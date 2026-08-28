/**
 * /api/linkedin/lead-lists/[id] — one list (dashboard-facing).
 *   GET    → { ok, list, members }
 *   PATCH  → { ok, list }         { name }   rename
 *   DELETE → { ok }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { getLeadList, listLeadListMembers, renameLeadList, deleteLeadList } from "@/lib/linkedin/lead-lists"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const list = await getLeadList(auth.id, id)
  if (!list) return NextResponse.json({ ok: false, error: "List not found" }, { status: 404 })
  return NextResponse.json({ ok: true, list, members: await listLeadListMembers(id) })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const list = await renameLeadList(auth.id, id, body.name)
  if (!list) return NextResponse.json({ ok: false, error: "List not found" }, { status: 404 })
  return NextResponse.json({ ok: true, list })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const ok = await deleteLeadList(auth.id, id)
  if (!ok) return NextResponse.json({ ok: false, error: "List not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
