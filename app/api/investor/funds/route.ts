import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { getEntity, factsOf, InvestorError } from "@/lib/investor/profile"
import { listedFunds } from "@/lib/investor/listing"
import { rankFunds } from "@/lib/investor/fit"

export const runtime = "nodejs"
/** The listed funds ranked for one of the person's entities (?entityId=): eligible first, then unclear, then ineligible; best fit first within each. */
export async function GET(req: NextRequest) {
  try {
    const c = await investorContext()
    const entityId = req.nextUrl.searchParams.get("entityId") ?? ""
    const entity = await getEntity(c.userId, entityId)
    if (!entity) throw new InvestorError("Choose which of your entities to look for.", 404, "not_found")
    const funds = await listedFunds()
    const ranked = rankFunds(factsOf(entity), funds.map((f) => f.facts))
    const by = new Map(funds.map((f) => [f.facts.fundId, f]))
    return NextResponse.json({ entityId, funds: ranked.map((r) => ({ ...r, summary: by.get(r.fundId)!.snapshot.strategy ?? by.get(r.fundId)!.snapshot.description, manager: by.get(r.fundId)!.snapshot.manager, whoMayInvest: by.get(r.fundId)!.snapshot.whoMayInvest })) })
  } catch (e) { return investorFailure(e) }
}
