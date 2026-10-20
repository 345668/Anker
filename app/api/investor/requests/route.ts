import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { myRequests, requestToConnect } from "@/lib/investor/requests"

export const runtime = "nodejs"
export async function GET() { try { return NextResponse.json({ requests: await myRequests((await investorContext()).userId) }) } catch (e) { return investorFailure(e) } }
/** { entityId, fundId, indicativeMin?, indicativeMax?, timing?, note?, share? }: an expression of interest, not an offer or an obligation. */
export async function POST(req: NextRequest) {
  try { const c = await investorContext(); return NextResponse.json({ ok: true, ...(await requestToConnect(c.userId, await req.json())) }, { status: 201 }) } catch (e) { return investorFailure(e) }
}
