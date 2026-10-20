import { NextRequest, NextResponse } from "next/server"
import { fundContext, investorFailure } from "@/lib/investor/access"
import { InvestorError } from "@/lib/investor/profile"
import { setPrefs } from "@/lib/investor/talks"

export const runtime = "nodejs"
/** { action: "mute" | "unmute" | "block" }: a block declines the request and stops that person asking this fund again. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await fundContext(true), b = await req.json()
    if (!["mute", "unmute", "block"].includes(b?.action)) throw new InvestorError("Choose mute, unmute or block.")
    return NextResponse.json({ ok: true, ...(await setPrefs("fund", { fundId: c.fund.fundId }, (await params).id, b.action)) })
  } catch (e) { return investorFailure(e) }
}
