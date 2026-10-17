/** POST /api/portal/[token]/request { kind, body } — the investor asks the fund for something (docs/architecture/60 section 8). Recorded in their own words and put before the fund; nothing about their holding changes. Needs the session. */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { LpError, sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"
import { requestsForLp, submitRequest } from "@/lib/portfolio/lp-requests"

export const runtime = "nodejs"
const noStore = { "Cache-Control": "private, no-store" }

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more." }, { status: 401, headers: noStore })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first.", code: "no_session" }, { status: 401, headers: noStore })
  const b = await req.json().catch(() => ({}))
  try {
    const { propose } = await import("@/lib/actions/store")
    const r = await submitRequest({ lpId: lp.lpId, fundId: lp.fundId }, { kind: b?.kind, body: b?.body, source: "form" }, propose as never)
    await logPortalAccess(lp.tokenId, lp.lpId, "request:sent", req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null)
    return NextResponse.json({ ok: true, requests: await requestsForLp(lp.lpId), id: r.id }, { status: 201, headers: noStore })
  } catch (e) { if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: noStore }); throw e }
}
