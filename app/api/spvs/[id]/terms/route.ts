import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { setSpvTerms } from "@/lib/modules/spv-economics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  const carry = Number(b.carryPct)
  const hurdle = Number(b.hurdlePct)
  if (!Number.isFinite(carry) || !Number.isFinite(hurdle)) {
    return NextResponse.json({ error: "carryPct and hurdlePct required" }, { status: 400 })
  }
  const econ = await setSpvTerms(user.id, id, carry, hurdle)
  if (!econ) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ economics: econ })
}
