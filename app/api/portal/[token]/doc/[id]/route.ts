/** GET /api/portal/[token]/doc/[id] — a document the fund published to this investor (tax document, annual statement, notice). Needs the session; logged. */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"
import { documentForLp } from "@/lib/portfolio/lp-statement"

export const runtime = "nodejs"

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more." }, { status: 401 })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first." }, { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const d = await documentForLp(lp.fundId, lp.lpId, id); if (!d) return NextResponse.json({ error: "Not found." }, { status: 404 })
  await logPortalAccess(lp.tokenId, lp.lpId, `doc:${id}`, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null)
  return new NextResponse(new Uint8Array(d.bytes), { headers: { "content-type": d.contentType, "content-disposition": `attachment; filename="${d.filename.replace(/[^\w.\- ]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } })
}
