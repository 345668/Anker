import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { listMeetings, proposeMeeting } from "@/lib/investor/materials"

export const runtime = "nodejs"
type Ctx = { params: Promise<{ id: string }> }
export async function GET(_r: NextRequest, { params }: Ctx) { try { const c = await investorContext(); return NextResponse.json({ meetings: await listMeetings("investor", { userId: c.userId }, (await params).id) }) } catch (e) { return investorFailure(e) } }
/** { startsAt?, link?, note? } */
export async function POST(req: NextRequest, { params }: Ctx) { try { const c = await investorContext(); await proposeMeeting("investor", { userId: c.userId }, (await params).id, await req.json()); return NextResponse.json({ ok: true }, { status: 201 }) } catch (e) { return investorFailure(e) } }
