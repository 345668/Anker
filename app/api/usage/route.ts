/** GET /api/usage -> this month's AI allowance and where it went, for the signed-in person's workspace (docs/architecture/58 section 5). */
import { NextResponse } from "next/server"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { workspaceError } from "@/lib/auth/workspace-context"
import { allowanceOf, usageByArea } from "@/lib/metering/allowance"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const p = await requireAiPrincipal()
    if (!p.orgId) return NextResponse.json({ limit: null, used: 0, remaining: null, pct: null, areas: [], resetsOn: null }, { headers: { "Cache-Control": "private, no-store" } })
    const now = new Date(), resets = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
    return NextResponse.json({ ...(await allowanceOf(p.orgId)), areas: await usageByArea(p.orgId), resetsOn: resets.toISOString().slice(0, 10) }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (e) { return workspaceError(e) }
}
