import { NextRequest, NextResponse } from "next/server"
import { auditContext } from "@/lib/audit/record-change"
import { fundContext, investorFailure } from "@/lib/investor/access"
import { getListingState, saveListing } from "@/lib/investor/listing"

export const runtime = "nodejs"
export async function GET() { try { const c = await fundContext(); return NextResponse.json({ listing: await getListingState(c.orgId) }) } catch (e) { return investorFailure(e) } }
/** { rules?, listed? }: set who may invest, list or unlist, and refresh what investors see. Listing needs the rules. */
export async function PUT(req: NextRequest) {
  try {
    const c = await fundContext(true), body = await req.json()
    return NextResponse.json({ ok: true, listing: await saveListing({ orgId: c.orgId, userId: c.userId }, { rules: body?.rules, listed: typeof body?.listed === "boolean" ? body.listed : undefined }, auditContext(req, { id: c.userId })) })
  } catch (e) { return investorFailure(e) }
}
