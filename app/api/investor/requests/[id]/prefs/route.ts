import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { InvestorError } from "@/lib/investor/profile"
import { setPrefs } from "@/lib/investor/talks"

export const runtime = "nodejs"
/** { action: "mute" | "unmute" | "block" } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await investorContext(), b = await req.json()
    if (!["mute", "unmute", "block"].includes(b?.action)) throw new InvestorError("Choose mute, unmute or block.")
    return NextResponse.json({ ok: true, ...(await setPrefs("investor", { userId: c.userId }, (await params).id, b.action)) })
  } catch (e) { return investorFailure(e) }
}
