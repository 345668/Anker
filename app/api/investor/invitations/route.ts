import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { InvestorError } from "@/lib/investor/profile"
import { answerInvitation, myInvitations } from "@/lib/investor/team"

export const runtime = "nodejs"
export async function GET() { try { const c = await investorContext(); return NextResponse.json({ invitations: await myInvitations(c.email, c.confirmed) }) } catch (e) { return investorFailure(e) } }
/** { action: "accept" | "decline", id } — answered by the invited person, signed in with the invited, confirmed address. */
export async function POST(req: NextRequest) {
  try {
    const c = await investorContext(), b = await req.json()
    if (b?.action !== "accept" && b?.action !== "decline") throw new InvestorError("Choose accept or decline.")
    await answerInvitation(c.userId, c.email, c.confirmed, String(b.id ?? ""), b.action)
    return NextResponse.json({ ok: true })
  } catch (e) { return investorFailure(e) }
}
