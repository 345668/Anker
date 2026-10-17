/** POST /api/portal/[token]/subscription (multipart: file, ackName, agree) — the investor confirms they have read the documents and returns the signed copy (docs/architecture/60 section 7). Needs the code-verified session. */
import { NextRequest, NextResponse } from "next/server"
import { verifyPortalToken, logPortalAccess } from "@/lib/portfolio/lp-portal"
import { LpError, sessionCookieName, sessionOk } from "@/lib/portfolio/lp-onboarding"
import { lpSubscriptionView, returnSigned } from "@/lib/portfolio/lp-subscription"

export const runtime = "nodejs"
export const maxDuration = 30
const noStore = { "Cache-Control": "private, no-store" }

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  const lp = await verifyPortalToken(token)
  if (!lp) return NextResponse.json({ error: "This link is not valid any more." }, { status: 401, headers: noStore })
  if (!(await sessionOk(lp.tokenId, req.cookies.get(sessionCookieName(lp.tokenId))?.value))) return NextResponse.json({ error: "Please enter your code first.", code: "no_session" }, { status: 401, headers: noStore })
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  try {
    const f = await req.formData(); const file = f.get("file")
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose your signed PDF." }, { status: 400, headers: noStore })
    await returnSigned(lp.lpId, { ackName: f.get("ackName"), agree: f.get("agree"), filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) }, ip)
    await logPortalAccess(lp.tokenId, lp.lpId, "subscription:returned", ip)
    return NextResponse.json({ ok: true, subscription: await lpSubscriptionView(lp.lpId) }, { headers: noStore })
  } catch (e) { if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status, headers: noStore }); throw e }
}
