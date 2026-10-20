import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { materialsForInvestor } from "@/lib/investor/materials"

export const runtime = "nodejs"
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const c = await investorContext(); return NextResponse.json(await materialsForInvestor(c.userId, (await params).id)) } catch (e) { return investorFailure(e) }
}
