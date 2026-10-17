/**
 * The fund's side of one LP's subscription (docs/architecture/60 section 7). Fund managers only.
 *   POST json { action: "send", shareClass?, date? }   sends the current package (needs the LP to have accepted the terms and a commitment)
 *   POST json { action: "reject", reason }             sends it back with a reason
 *   POST multipart { action: "accept", file? }         countersigns; the fund's own countersigned PDF is optional
 */
import { NextRequest, NextResponse } from "next/server"
import { requireLpManager } from "@/lib/auth/lp-manager"
import { LpError } from "@/lib/portfolio/lp-onboarding"
import { decide, sendToLp } from "@/lib/portfolio/lp-subscription"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"

export async function POST(req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const { lpId } = await ctx.params
  const g = await requireLpManager(lpId); if (g instanceof NextResponse) return g
  try {
    let action = "", body: any = {}, file: File | null = null
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) { const f = await req.formData(); action = String(f.get("action") ?? ""); const x = f.get("file"); file = x instanceof File && x.size > 0 ? x : null }
    else { body = await req.json().catch(() => ({})); action = String(body?.action ?? "") }
    if (action === "send") await sendToLp(lpId, g.id, body)
    else if (action === "reject") await decide(lpId, g.id, { decision: "reject", reason: body?.reason })
    else if (action === "accept") await decide(lpId, g.id, { decision: "accept", countersigned: file ? { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) } : null })
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 })
    await logAudit({ actorId: g.id, action: `lp.subscription_${action}`, targetType: "fund_lp", targetId: lpId, metadata: {} })
    return NextResponse.json({ ok: true })
  } catch (e) { if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status }); throw e }
}
