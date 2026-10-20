import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { withdraw } from "@/lib/investor/requests"

export const runtime = "nodejs"
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const c = await investorContext(); await withdraw(c.userId, (await params).id); return NextResponse.json({ ok: true }) } catch (e) { return investorFailure(e) }
}
