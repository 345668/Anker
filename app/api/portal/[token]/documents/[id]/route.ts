/** GET /api/portal/[token]/documents/[id] — opens one of this investor's fund documents and writes the access log (docs/architecture/60). Needs the code-verified session. */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"

export const runtime = "nodejs"

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more." }, { status: 401 })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first." }, { status: 401 })
  const [d] = (await sql`SELECT pdf_url FROM lp_reports WHERE id::text = ${id} AND fund_id = ${lp.fundId} AND pdf_url IS NOT NULL AND status IN ('sent','published','approved','final') LIMIT 1`) as any[]
  if (!d?.pdf_url) return NextResponse.json({ error: "Document not found." }, { status: 404 })
  await logPortalAccess(lp.tokenId, lp.lpId, `document:${id}`, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null)
  return NextResponse.redirect(String(d.pdf_url), 302)
}
