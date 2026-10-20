import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { shareWithFund } from "@/lib/investor/passport"

export const runtime = "nodejs"
/** { relationshipId, docTypes: string[] } — consent to share a copy of these documents with that one fund. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const c = await investorContext(), b = await req.json(); return NextResponse.json({ ok: true, ...(await shareWithFund(c.userId, (await params).id, String(b?.relationshipId ?? ""), b?.docTypes)) }) } catch (e) { return investorFailure(e) }
}
