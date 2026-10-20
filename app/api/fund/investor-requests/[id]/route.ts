import { NextRequest, NextResponse } from "next/server"
import { fundContext, investorFailure } from "@/lib/investor/access"
import { InvestorError } from "@/lib/investor/profile"
import { decide } from "@/lib/investor/requests"

export const runtime = "nodejs"
/** { decision: "accept" | "decline", reason? }: once, for a request still waiting. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await fundContext(true), b = await req.json()
    if (b?.decision !== "accept" && b?.decision !== "decline") throw new InvestorError("Choose accept or decline.")
    return NextResponse.json({ ok: true, ...(await decide(c.fund.fundId, (await params).id, b.decision, c.userId, b.reason)) })
  } catch (e) { return investorFailure(e) }
}
