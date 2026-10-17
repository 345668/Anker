/** GET /api/portal/[token]/statement — this investor's capital account statement as a PDF (docs/architecture/60 section 8). Needs the code-verified session; logged. */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"
import { statementFor, statementPdf } from "@/lib/portfolio/lp-statement"

export const runtime = "nodejs"
export const maxDuration = 30

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more." }, { status: 401 })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first." }, { status: 401 })
  const v = await statementFor(lp.fundId, lp.lpId)
  if (!v) return NextResponse.json({ error: "No statement is available." }, { status: 404 })
  await logPortalAccess(lp.tokenId, lp.lpId, "statement:pdf", req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null)
  return new NextResponse(Buffer.from(await statementPdf(v)), { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="capital-account-statement-${v.asOf}.pdf"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } })
}
