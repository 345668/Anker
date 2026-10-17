/**
 * POST /api/portfolio/lps/[lpId]/invite — emails the LP a personal portal link valid 30 days (a resend replaces the earlier link). docs/architecture/60.
 * One email per click, to the one address on the LP's row. Fund managers only.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireLpManager } from "@/lib/auth/lp-manager"
import { inviteLp, LpError } from "@/lib/portfolio/lp-onboarding"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"

const appUrl = (req: NextRequest) => process.env.NEXT_PUBLIC_APP_URL || req.headers.get("origin") || `https://${req.headers.get("host") ?? "www.an-ker.de"}`

export async function POST(req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const { lpId } = await ctx.params
  const g = await requireLpManager(lpId); if (g instanceof NextResponse) return g
  try {
    const body = await req.json().catch(() => ({}))
    const kind = body?.kind === "reminder" ? "reminder" : body?.kind === "new_material" ? "new_material" : "invite"
    const r = await inviteLp(lpId, g.id, appUrl(req), undefined, kind)
    await logAudit({ actorId: g.id, action: kind === "invite" ? "lp.invited" : `lp.invite_${kind}`, targetType: "fund_lp", targetId: lpId, metadata: {} })
    return NextResponse.json({ ok: true, ...r }, { status: 201 })
  } catch (e) {
    if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status })
    console.error("[lp-invite]", (e as Error)?.message)
    return NextResponse.json({ error: "Could not send the email. Nothing was sent." }, { status: 502 })
  }
}
