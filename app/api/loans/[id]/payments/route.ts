import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { addPayment, getLoan, getLoanServicing } from "@/lib/modules/loan-servicing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KINDS = ["scheduled", "interest", "prepayment", "payoff"]

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params

  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  const amount = Number(b.amount)
  if (!b.paidOn || !Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "paidOn and a positive amount are required" }, { status: 400 })
  }
  const kind = KINDS.includes(b.kind) ? b.kind : "scheduled"

  const payment = await addPayment({ userId: user.id, loanId: id, paidOn: String(b.paidOn), amount, kind, note: b.note ?? null })
  if (!payment) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const loan = await getLoan(user.id, id)
  const servicing = loan ? await getLoanServicing(loan) : null
  return NextResponse.json({ payment, loan, servicing })
}
