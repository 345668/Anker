/** GET /api/portfolio/funds/[id]/lp-onboarding — every LP of the fund with their onboarding step, contact address, and what they submitted (docs/architecture/60). Fund managers only. */
import { NextRequest, NextResponse } from "next/server"
import { requireFundManager } from "@/lib/auth/lp-manager"
import { listForFund } from "@/lib/portfolio/lp-onboarding"
import { reviewsForFund } from "@/lib/portfolio/lp-subscription"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  const [lps, reviews] = await Promise.all([listForFund(g.fundId), reviewsForFund(g.fundId)])
  return NextResponse.json({ lps: lps.map((l) => ({ ...l, subscription: reviews[l.id] ?? null })) }, { headers: { "Cache-Control": "private, no-store" } })
}
