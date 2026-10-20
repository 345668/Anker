import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { createEntity, listEntities } from "@/lib/investor/profile"

export const runtime = "nodejs"
export async function GET() { try { return NextResponse.json({ entities: await listEntities((await investorContext()).userId) }) } catch (e) { return investorFailure(e) } }
export async function POST(req: NextRequest) {
  try { const c = await investorContext(); return NextResponse.json({ entity: await createEntity(c.userId, await req.json()) }, { status: 201 }) } catch (e) { return investorFailure(e) }
}
