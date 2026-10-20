import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { dashboardOf } from "@/lib/investor/team"

export const runtime = "nodejs"
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const c = await investorContext(); return NextResponse.json(await dashboardOf(c.userId, (await params).id)) } catch (e) { return investorFailure(e) }
}
