/**
 * The fund's side of one investor's verification (docs/architecture/60 section 6). Fund managers only (workspace owner or admin).
 *   GET                                   -> who the investor says owns the entity (shown on request, written to the audit log)
 *   POST json { action: "verify" | "reject", docType, note? } -> a person marks one document checked, or sends it back with a reason
 */
import { NextRequest, NextResponse } from "next/server"
import { requireLpManager } from "@/lib/auth/lp-manager"
import { LpError } from "@/lib/portfolio/lp-onboarding"
import { ownersFor, reviewDocument } from "@/lib/portfolio/lp-verification"
import { logAudit } from "@/lib/audit/audit-log"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const { lpId } = await ctx.params
  const g = await requireLpManager(lpId); if (g instanceof NextResponse) return g
  await logAudit({ actorId: g.id, action: "lp.kyc_owners_viewed", targetType: "fund_lp", targetId: lpId, metadata: {} })
  return NextResponse.json({ owners: await ownersFor(g.fundId, lpId) }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ lpId: string }> }) {
  const { lpId } = await ctx.params
  const g = await requireLpManager(lpId); if (g instanceof NextResponse) return g
  const b = await req.json().catch(() => ({}))
  if (b?.action !== "verify" && b?.action !== "reject") return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  try { await reviewDocument(lpId, g.id, { docType: b.docType, decision: b.action, note: b.note }) }
  catch (e) { if (e instanceof LpError) return NextResponse.json({ error: e.message, code: e.code }, { status: e.status }); throw e }
  return NextResponse.json({ ok: true })
}
