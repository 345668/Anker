/** GET /api/portfolio/funds/[id]/lp-onboarding — every LP of the fund with their onboarding step, contact address, and what they submitted (docs/architecture/60). Fund managers only. */
import { NextRequest, NextResponse } from "next/server"
import { requireFundManager } from "@/lib/auth/lp-manager"
import { listForFund } from "@/lib/portfolio/lp-onboarding"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  return NextResponse.json({ lps: await listForFund(g.fundId) }, { headers: { "Cache-Control": "private, no-store" } })
}
