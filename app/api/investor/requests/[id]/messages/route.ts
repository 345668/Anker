import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { readThread, sendMessage } from "@/lib/investor/talks"

export const runtime = "nodejs"
type Ctx = { params: Promise<{ id: string }> }
export async function GET(_r: NextRequest, { params }: Ctx) {
  try { const c = await investorContext(); return NextResponse.json(await readThread("investor", { userId: c.userId }, (await params).id)) } catch (e) { return investorFailure(e) }
}
export async function POST(req: NextRequest, { params }: Ctx) {
  try { const c = await investorContext(); const b = await req.json(); return NextResponse.json({ ok: true, message: await sendMessage("investor", { userId: c.userId, senderId: c.userId }, (await params).id, b?.body) }, { status: 201 }) } catch (e) { return investorFailure(e) }
}
