import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { archiveEntity, updateEntity } from "@/lib/investor/profile"

export const runtime = "nodejs"
type Ctx = { params: Promise<{ id: string }> }
export async function PUT(req: NextRequest, { params }: Ctx) {
  try { const c = await investorContext(); return NextResponse.json({ entity: await updateEntity(c.userId, (await params).id, await req.json()) }) } catch (e) { return investorFailure(e) }
}
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try { const c = await investorContext(); await archiveEntity(c.userId, (await params).id); return NextResponse.json({ ok: true }) } catch (e) { return investorFailure(e) }
}
