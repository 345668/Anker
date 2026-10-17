/** GET /api/portfolio/lps/[lpId]/statement-pdf — the same capital account statement the investor gets, for the fund to send or file. Fund managers only. */
import { NextRequest, NextResponse } from "next/server"
import { requireLpManager } from "@/lib/auth/lp-manager"
import { statementFor, statementPdf } from "@/lib/portfolio/lp-statement"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(_req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const { lpId } = await ctx.params
  const g = await requireLpManager(lpId); if (g instanceof NextResponse) return g
  const v = await statementFor(g.fundId, lpId); if (!v) return NextResponse.json({ error: "No statement is available." }, { status: 404 })
  return new NextResponse(Buffer.from(await statementPdf(v)), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="capital-account-statement-${v.asOf}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } })
}
