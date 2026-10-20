import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { revokeShare } from "@/lib/investor/passport"

export const runtime = "nodejs"
/** { shareId } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const c = await investorContext(), b = await req.json(); return NextResponse.json({ ok: true, ...(await revokeShare(c.userId, (await params).id, String(b?.shareId ?? ""))) }) } catch (e) { return investorFailure(e) }
}
