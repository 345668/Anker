/**
 * POST /api/portal/[token]/account { password? } — the investor's optional account (docs/architecture/60 section 4). Needs the code-verified session, which is what proves the address.
 * Makes an account for that address, or adds this investment to the one already made. Does not sign anyone in: they sign in at the usual page.
 */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { LpError, sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"
import { enableAccount } from "@/lib/portfolio/lp-account"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
const noStore = { "Cache-Control": "private, no-store" }

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more." }, { status: 401, headers: noStore })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first.", code: "no_session" }, { status: 401, headers: noStore })
  const b = await req.json().catch(() => ({}))
  try {
    const r = await enableAccount(lp.lpId, b?.password, () => createAdminClient().auth.admin as never)
    await logPortalAccess(lp.tokenId, lp.lpId, r.created ? "account:created" : "account:linked", req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null)
    return NextResponse.json({ ok: true, created: r.created, email: r.email, signIn: "/auth/login?redirect=/lp" }, { headers: noStore })
  } catch (e) { if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: noStore }); throw e }
}
