/** GET /api/portal/[token]/subscription/[id] — a document of the package sent to this investor, or their own signed or countersigned copy. Logged. Needs the session. */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"
import { fileForLp } from "@/lib/portfolio/lp-subscription"

export const runtime = "nodejs"

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more." }, { status: 401 })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first." }, { status: 401 })
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Not found." }, { status: 404 })
  const f = await fileForLp(lp.lpId, id); if (!f) return NextResponse.json({ error: "Not found." }, { status: 404 })
  await logPortalAccess(lp.tokenId, lp.lpId, `subscription-file:${id}`, req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null)
  return new NextResponse(new Uint8Array(f.bytes), { headers: { "content-type": f.contentType, "content-disposition": `attachment; filename="${f.filename.replace(/[^\w.\- ]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } })
}
