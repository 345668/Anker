import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { setCovenant, removeCovenant, listCovenants } from "@/lib/modules/loan-servicing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const COV_STATUSES = ["ok", "at_risk", "breached", "waived"]

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, cid } = await params
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (b.status && !COV_STATUSES.includes(b.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 })
  const ok = await setCovenant(user.id, id, cid, { status: b.status, note: typeof b.note === "string" ? b.note : undefined })
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ covenants: await listCovenants(id) })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; cid: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, cid } = await params
  const ok = await removeCovenant(user.id, id, cid)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ ok: true, covenants: await listCovenants(id) })
}
