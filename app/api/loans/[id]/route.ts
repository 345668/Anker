import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  getLoan, getLoanServicing, listPayments, listCovenants,
  setLoanStatus, updateLoanTerms, type LoanFull,
} from "@/lib/modules/loan-servicing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUSES = ["active", "repaid", "default", "written_off"]
const FREQS = ["monthly", "quarterly", "semiannual", "annual", "bullet"]
const AMORTS = ["bullet", "amortizing", "interest_only", "revolving"]

async function uid(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await uid()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  const loan = await getLoan(userId, id)
  if (!loan) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const [servicing, payments, covenants] = await Promise.all([getLoanServicing(loan), listPayments(id), listCovenants(id)])
  return NextResponse.json({ loan, servicing, payments, covenants })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await uid()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }

  let loan: LoanFull | null = null
  if (typeof b.status === "string") {
    if (!STATUSES.includes(b.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 })
    loan = await setLoanStatus(userId, id, b.status)
  } else {
    if (b.frequency && !FREQS.includes(b.frequency)) return NextResponse.json({ error: "invalid frequency" }, { status: 400 })
    if (b.amortization && !AMORTS.includes(b.amortization)) return NextResponse.json({ error: "invalid amortization" }, { status: 400 })
    loan = await updateLoanTerms(userId, id, {
      rate: b.rate === undefined ? null : Number(b.rate),
      maturity: b.maturity ?? null,
      frequency: b.frequency ?? null,
      amortization: b.amortization ?? null,
    })
  }
  if (!loan) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const servicing = await getLoanServicing(loan)
  return NextResponse.json({ loan, servicing })
}
