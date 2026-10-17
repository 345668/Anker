/** PATCH /api/portfolio/lps/[lpId]/contact { email, name? } — the address this LP is invited at (docs/architecture/60). Fund managers only. */
import { NextRequest, NextResponse } from "next/server"
import { requireLpManager } from "@/lib/auth/lp-manager"
import { LpError, setContact } from "@/lib/portfolio/lp-onboarding"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const { lpId } = await ctx.params
  const g = await requireLpManager(lpId); if (g instanceof NextResponse) return g
  const b = await req.json().catch(() => ({}))
  try { await setContact(lpId, b) } catch (e) { if (e instanceof LpError) return NextResponse.json({ error: e.message }, { status: e.status }); throw e }
  await logAudit({ actorId: g.id, action: "lp.contact_set", targetType: "fund_lp", targetId: lpId, metadata: {} })
  return NextResponse.json({ ok: true })
}
