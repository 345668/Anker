/**
 * /api/linkedin/campaigns/[id] — one campaign (dashboard-facing).
 *   GET    → { ok, campaign, steps, members, counts }
 *   PATCH  → { ok, campaign }   { name?, status?, senderId?, fullAuto? }
 *   DELETE → { ok }            archive (soft)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { getCampaign, updateCampaign, listSteps, listMembers, memberStateCounts } from "@/lib/linkedin/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const campaign = await getCampaign(auth.id, id)
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 })
  const [steps, members, counts] = await Promise.all([listSteps(id), listMembers(id), memberStateCounts(id)])
  return NextResponse.json({ ok: true, campaign, steps, members, counts })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const body = await req.json().catch(() => ({}))
  const campaign = await updateCampaign(auth.id, id, {
    name: body.name,
    status: body.status,
    senderId: body.senderId,
    fullAuto: body.fullAuto,
  })
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 })
  return NextResponse.json({ ok: true, campaign })
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const { id } = await ctx.params
  const campaign = await updateCampaign(auth.id, id, { status: "archived" })
  if (!campaign) return NextResponse.json({ ok: false, error: "Campaign not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
