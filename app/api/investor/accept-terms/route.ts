import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { acceptTerms } from "@/lib/investor/profile"

export const runtime = "nodejs"
/** { accept: true } — the signed-in investor accepts the current version of the investor terms and notice. */
export async function POST(req: NextRequest) {
  try { const c = await investorContext(), b = await req.json(); await acceptTerms(c.userId, b?.accept === true); return NextResponse.json({ ok: true }) } catch (e) { return investorFailure(e) }
}
