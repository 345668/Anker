import { NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { exportInvestor } from "@/lib/investor/rights"

export const runtime = "nodejs"
/** A copy of everything held about the signed-in investor, as a file. No file contents. */
export async function GET() {
  try {
    const c = await investorContext()
    return new NextResponse(JSON.stringify(await exportInvestor(c.userId), null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="anker-my-data.json"', "Cache-Control": "private, no-store" } })
  } catch (e) { return investorFailure(e) }
}
