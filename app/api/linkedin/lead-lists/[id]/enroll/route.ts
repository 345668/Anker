/**
 * POST /api/linkedin/lead-lists/[id]/enroll — bulk-enroll a list into a campaign.
 * Body: { campaignId }
 * → { ok, added }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { enrollListIntoCampaign } from "@/lib/linkedin/lead-lists"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : ""
  if (!campaignId) return NextResponse.json({ ok: false, error: "campaignId required" }, { status: 400 })
  try {
    return NextResponse.json({ ok: true, added: await enrollListIntoCampaign(auth.id, id, campaignId) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Enroll failed" }, { status: 400 })
  }
}
