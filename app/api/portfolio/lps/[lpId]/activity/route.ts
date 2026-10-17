/** GET /api/portfolio/lps/[lpId]/activity — what this investor did in their portal (docs/architecture/60 section 8): when, and in plain words. No document titles, no amounts. Fund managers only. */
import { NextRequest, NextResponse } from "next/server"
import { requireLpManager } from "@/lib/auth/lp-manager"
import { activityFor } from "@/lib/portfolio/lp-statement"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const { lpId } = await ctx.params
  const g = await requireLpManager(lpId); if (g instanceof NextResponse) return g
  return NextResponse.json(await activityFor(lpId), { headers: { "Cache-Control": "private, no-store" } })
}
