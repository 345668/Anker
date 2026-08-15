import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  updateSubscription, removeSubscription, getSpv, getSpvRollup,
  SPV_SUB_STATUSES, type SpvSubStatus,
} from "@/lib/modules/spv-lifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, subId } = await params

  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  const status = typeof b.status === "string" && SPV_SUB_STATUSES.includes(b.status) ? (b.status as SpvSubStatus) : null

  const sub = await updateSubscription({
    userId: user.id, spvId: id, subId,
    amount: b.amount === undefined ? null : (Number(b.amount) || 0),
    status,
    investorEmail: b.investorEmail ?? null,
    subscribedAt: b.subscribedAt ?? null,
  })
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const spv = await getSpv(user.id, id)
  const rollup = spv ? await getSpvRollup(id, spv.target_amount) : null
  return NextResponse.json({ subscription: sub, spv, rollup })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; subId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, subId } = await params
  const ok = await removeSubscription(user.id, id, subId)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const spv = await getSpv(user.id, id)
  const rollup = spv ? await getSpvRollup(id, spv.target_amount) : null
  return NextResponse.json({ ok: true, spv, rollup })
}
