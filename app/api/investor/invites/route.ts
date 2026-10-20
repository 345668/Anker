import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { InvestorError } from "@/lib/investor/profile"
import { answerInvite, invitesForMe } from "@/lib/investor/discovery"

export const runtime = "nodejs"
export async function GET() { try { const c = await investorContext(); return NextResponse.json({ invites: await invitesForMe(c.userId) }) } catch (e) { return investorFailure(e) } }
/** { id, action: "accept" | "decline", share? } */
export async function POST(req: NextRequest) {
  try {
    const c = await investorContext(), b = await req.json()
    if (b?.action !== "accept" && b?.action !== "decline") throw new InvestorError("Choose accept or decline.")
    return NextResponse.json({ ok: true, ...(await answerInvite(c.userId, String(b.id ?? ""), b.action, b.share ?? {})) })
  } catch (e) { return investorFailure(e) }
}
