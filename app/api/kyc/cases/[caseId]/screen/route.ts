import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { runScreening } from "@/lib/modules/kyc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(_req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { caseId } = await params
  const res = await runScreening(user.id, caseId)
  if (!res) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(res)
}
