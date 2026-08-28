/**
 * /api/linkedin/campaigns/[id]/senders — the campaign's sender rotation pool.
 *   GET → { ok, senderIds }
 *   PUT → { ok, senderIds }   { senderIds: string[] }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { getCampaign, listCampaignSenderIds, setCampaignSenders } from "@/lib/linkedin/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const campaign = await getCampaign(auth.id, id)
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 })
  return NextResponse.json({ ok: true, senderIds: await listCampaignSenderIds(id) })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const senderIds = Array.isArray(body.senderIds) ? body.senderIds.filter((x: unknown) => typeof x === "string") : []
  try {
    return NextResponse.json({ ok: true, senderIds: await setCampaignSenders(auth.id, id, senderIds) })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to set senders" }, { status: 400 })
  }
}
