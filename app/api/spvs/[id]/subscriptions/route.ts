import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { addSubscription, getSpv, getSpvRollup, SPV_SUB_STATUSES, type SpvSubStatus } from "@/lib/modules/spv-lifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!String(b?.investorName ?? "").trim()) return NextResponse.json({ error: "investorName required" }, { status: 400 })
  const status = SPV_SUB_STATUSES.includes(b.status) ? (b.status as SpvSubStatus) : "invited"

  const sub = await addSubscription({
    userId: user.id, spvId: id,
    investorName: String(b.investorName), investorEmail: b.investorEmail ?? null,
    amount: Number(b.amount) || 0, status, subscribedAt: b.subscribedAt ?? null,
  })
  if (!sub) return NextResponse.json({ error: "SPV not found" }, { status: 404 })

  const spv = await getSpv(user.id, id)
  const rollup = spv ? await getSpvRollup(id, spv.target_amount) : null
  return NextResponse.json({ subscription: sub, spv, rollup })
}
