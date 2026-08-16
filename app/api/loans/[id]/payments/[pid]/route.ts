import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { removePayment, getLoan, getLoanServicing } from "@/lib/modules/loan-servicing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; pid: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id, pid } = await params
  const ok = await removePayment(user.id, id, pid)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const loan = await getLoan(user.id, id)
  const servicing = loan ? await getLoanServicing(loan) : null
  return NextResponse.json({ ok: true, loan, servicing })
}
