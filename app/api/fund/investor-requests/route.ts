import { NextRequest, NextResponse } from "next/server"
import { fundContext, investorFailure } from "@/lib/investor/access"
import { inbound } from "@/lib/investor/requests"

export const runtime = "nodejs"
export async function GET(req: NextRequest) {
  try { const c = await fundContext(); return NextResponse.json({ fund: { id: c.fund.fundId, name: c.fund.fundName }, requests: await inbound(c.fund.fundId, { stage: req.nextUrl.searchParams.get("stage") ?? undefined }) }) } catch (e) { return investorFailure(e) }
}
