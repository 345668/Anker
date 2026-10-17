/**
 * The emailed code that opens an investor portal (docs/architecture/60 section 4). The link alone shows nothing about the investor.
 *   POST { action: "send" }            -> emails a six-digit code to the investor's address on file
 *   POST { action: "verify", code }    -> checks it (three tries) and sets the 12-hour session cookie
 */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { LpError, SESSION_HOURS, sendCode, sessionCookieName, verifyCode } from "@/lib/portfolio/lp-onboarding"

export const runtime = "nodejs"
const noStore = { "Cache-Control": "private, no-store" }
const ipOf = (req: NextRequest) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more. Please ask the fund for a new one." }, { status: 401, headers: noStore })
  const b = await req.json().catch(() => ({}))
  try {
    if (b?.action === "send") return NextResponse.json({ ok: true, ...(await sendCode(lp.tokenId, lp.lpId)) }, { headers: noStore })
    if (b?.action === "verify") {
      const { session } = await verifyCode(lp.tokenId, lp.lpId, b.code, ipOf(req))
      await logPortalAccess(lp.tokenId, lp.lpId, "code-verified", ipOf(req))
      const res = NextResponse.json({ ok: true }, { headers: noStore })
      res.cookies.set(sessionCookieName(lp.tokenId), session, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_HOURS * 3600 })
      return res
    }
    return NextResponse.json({ error: "Unknown action." }, { status: 400, headers: noStore })
  } catch (e) {
    if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: noStore })
    console.error("[portal-code]", (e as Error)?.message)
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 502, headers: noStore })
  }
}
