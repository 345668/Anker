import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getSpv, setSpvStage, getSpvRollup, listSubscriptions, type SpvStage } from "@/lib/modules/spv-lifecycle"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STAGES: SpvStage[] = ["forming", "open", "closed", "wound_down"]

async function userId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await userId()
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const spv = await getSpv(uid, id)
  if (!spv) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const [subscriptions, rollup] = await Promise.all([listSubscriptions(id), getSpvRollup(id, spv.target_amount)])
  return NextResponse.json({ spv, subscriptions, rollup })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const uid = await userId()
  if (!uid) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  let stage = ""
  try { stage = String((await req.json())?.stage || "") } catch { /* ignore */ }
  if (!STAGES.includes(stage as SpvStage)) return NextResponse.json({ error: "invalid stage" }, { status: 400 })
  const spv = await setSpvStage(uid, id, stage as SpvStage)
  if (!spv) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const rollup = await getSpvRollup(id, spv.target_amount)
  return NextResponse.json({ spv, rollup })
}
