import { NextRequest, NextResponse } from "next/server"
import { accountContext, investorFailure } from "@/lib/investor/access"
import { createProfileForAccount } from "@/lib/investor/claim"

export const runtime = "nodejs"
/** For someone who already has an account (for example one made in an investor portal): { name, termsAccepted }. */
export async function POST(req: NextRequest) {
  try { const c = await accountContext(), b = await req.json(); await createProfileForAccount(c.userId, String(b?.name || c.name), b?.termsAccepted); return NextResponse.json({ ok: true }, { status: 201 }) } catch (e) { return investorFailure(e) }
}
