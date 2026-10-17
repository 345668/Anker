/** POST /api/portfolio/lps/[lpId]/review — the fund has read what the LP submitted about themselves (docs/architecture/60). It does not change the fund's own record. */
import { NextRequest, NextResponse } from "next/server"
import { requireLpManager } from "@/lib/auth/lp-manager"
import { markReviewed } from "@/lib/portfolio/lp-onboarding"

export const runtime = "nodejs"

export async function POST(_req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const { lpId } = await ctx.params
  const g = await requireLpManager(lpId); if (g instanceof NextResponse) return g
  await markReviewed(lpId, g.id)
  return NextResponse.json({ ok: true })
}
