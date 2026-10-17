/** POST /api/portal/[token]/onboarding { action: "confirm_details", ...details } | { action: "accept_terms" } — the investor's own onboarding steps. Needs the code-verified session. */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { LpError, acceptTerms, confirmDetails, onboardingView, sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"

export const runtime = "nodejs"
const noStore = { "Cache-Control": "private, no-store" }

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more." }, { status: 401, headers: noStore })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first.", code: "no_session" }, { status: 401, headers: noStore })
  const b = await req.json().catch(() => ({}))
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  try {
    if (b?.action === "confirm_details") await confirmDetails(lp.lpId, b)
    else if (b?.action === "accept_terms") await acceptTerms(lp.lpId, ip, req.headers.get("user-agent"))
    else return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore })
    await logPortalAccess(lp.tokenId, lp.lpId, `onboarding:${b.action}`, ip)
    return NextResponse.json({ ok: true, onboarding: await onboardingView(lp.lpId) }, { headers: noStore })
  } catch (e) {
    if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: noStore })
    throw e
  }
}
