import { NextRequest, NextResponse } from "next/server"
import { fundContext, investorFailure } from "@/lib/investor/access"
import { inviteToOnboard } from "@/lib/investor/bridge"

export const runtime = "nodejs"
/** The fund invites an investor it is talking to: makes the fund's investor record and sends the onboarding link (docs/architecture/66). */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await fundContext(true)
    const appUrl = (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.an-ker.de").replace(/\/$/, "")
    return NextResponse.json({ ok: true, ...(await inviteToOnboard(c.fund.fundId, (await params).id, c.userId, appUrl)) })
  } catch (e) { return investorFailure(e) }
}
