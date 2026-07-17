/**
 * GET /api/portal/[token]/letters/[id] — one quarterly letter's rendered HTML,
 * scoped to the token's LP fund. Token-authed (no admin session).
 */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, getPortalLetter, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { renderArticleHtml } from "@/lib/newsroom/markdown"

export const runtime = "nodejs"

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "Invalid or expired link." }, { status: 401 })

  const letter = await getPortalLetter(lp.fundId, id)
  if (!letter) return NextResponse.json({ error: "Letter not found" }, { status: 404 })

  await logPortalAccess(lp.tokenId, lp.lpId, `letter:${id}`, req.headers.get("x-forwarded-for")?.split(",")[0] ?? null)
  return NextResponse.json({
    title: letter.title,
    quarter: letter.quarter,
    html: renderArticleHtml(letter.contentMd),
  })
}
