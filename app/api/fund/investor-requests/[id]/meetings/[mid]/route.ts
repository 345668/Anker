import { NextRequest, NextResponse } from "next/server"
import { fundContext, investorFailure } from "@/lib/investor/access"
import { answerMeeting } from "@/lib/investor/materials"
import { InvestorError } from "@/lib/investor/profile"

export const runtime = "nodejs"
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; mid: string }> }) {
  try {
    const c = await fundContext(true), p = await params, b = await req.json()
    if (!["accept", "decline", "cancel"].includes(b?.action)) throw new InvestorError("Choose accept, decline or cancel.")
    return NextResponse.json({ ok: true, status: await answerMeeting("fund", { fundId: c.fund.fundId }, p.id, p.mid, b.action) })
  } catch (e) { return investorFailure(e) }
}
