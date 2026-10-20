import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { claimable, confirmClaim, startClaim } from "@/lib/investor/claim"
import { InvestorError } from "@/lib/investor/profile"

export const runtime = "nodejs"
/** Records funds added that carry this person's confirmed address. No amounts. */
export async function GET() {
  try { const c = await investorContext(); return NextResponse.json({ claims: await claimable(c.userId, c.email, c.confirmed) }) } catch (e) { return investorFailure(e) }
}
/** { action: "start", lpId } sends a code (or says none is needed); { action: "confirm", lpId, entityId, code } links the record. */
export async function POST(req: NextRequest) {
  try {
    const c = await investorContext(), b = await req.json()
    if (b?.action === "start") return NextResponse.json({ ok: true, ...(await startClaim(c.userId, c.email, c.confirmed, String(b.lpId ?? ""))) })
    if (b?.action === "confirm") return NextResponse.json({ ok: true, ...(await confirmClaim(c.userId, c.email, c.confirmed, { lpId: String(b.lpId ?? ""), entityId: String(b.entityId ?? ""), code: b.code })) })
    throw new InvestorError("Choose start or confirm.")
  } catch (e) { return investorFailure(e) }
}
