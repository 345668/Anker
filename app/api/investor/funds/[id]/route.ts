import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { InvestorError } from "@/lib/investor/profile"
import { listedFund } from "@/lib/investor/listing"
import { fitForEntity } from "@/lib/investor/requests"

export const runtime = "nodejs"
/** One listed fund as its snapshot, and (with ?entityId=) how it fits that entity. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await investorContext()
    const fund = await listedFund((await params).id)
    if (!fund) throw new InvestorError("That fund is not listed.", 404, "not_listed")
    const entityId = req.nextUrl.searchParams.get("entityId")
    return NextResponse.json({ fund: { id: fund.facts.fundId, snapshot: fund.snapshot, rules: fund.rules }, fit: entityId ? (await fitForEntity(c.userId, entityId, fund)).fit : null })
  } catch (e) { return investorFailure(e) }
}
