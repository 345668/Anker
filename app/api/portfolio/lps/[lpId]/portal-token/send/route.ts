/**
 * (Superseded by /api/portfolio/lps/[lpId]/invite, which fund managers can use; this older route stays for platform administrators and now does the same thing.)
 * POST /api/portfolio/lps/[lpId]/portal-token/send
 *
 * Emails the LP a personal portal link valid 30 days, to the address on the LP's row (see lib/portfolio/lp-onboarding.ts inviteLp).
 * Platform administrators only. 422 when the LP has no address on file.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { inviteLp, LpError } from "@/lib/portfolio/lp-onboarding"

export const runtime = "nodejs"

function baseUrl(req: NextRequest): string {
  return process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || `https://${req.headers.get("host") ?? "www.an-ker.de"}`
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { lpId } = await ctx.params
  try {
    const r = await inviteLp(lpId, guard.id, baseUrl(req))
    return NextResponse.json({ ok: true, sentTo: r.sentTo, expiresAt: r.expiresAt }, { status: 201 })
  } catch (e) {
    if (e instanceof LpError) return NextResponse.json({ error: e.message }, { status: e.status })
    return NextResponse.json({ error: "Could not send the email. Nothing was sent." }, { status: 502 })
  }
}
