/**
 * GET /api/linkedin/analytics — the LinkedOut funnel (dashboard-facing).
 * → { ok, report: { campaigns, totals } }
 */
import { NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { campaignFunnels } from "@/lib/linkedin/analytics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  return NextResponse.json({ ok: true, report: await campaignFunnels(auth.id) })
}
