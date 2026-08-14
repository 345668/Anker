import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { createLoan } from "@/lib/modules/carta-modules"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!String(b?.borrower ?? "").trim()) return NextResponse.json({ error: "borrower required" }, { status: 400 })
  const loan = await createLoan({
    userId: user.id, borrower: String(b.borrower), principal: Number(b.principal) || 0,
    rate: b.rate != null ? Number(b.rate) : null, origination: b.origination ?? null, maturity: b.maturity ?? null,
    amortization: b.amortization, status: b.status,
  })
  return NextResponse.json({ ok: true, loan })
}
