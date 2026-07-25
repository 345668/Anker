/**
 * GET /api/campaign/settings  — admin: current engine settings.
 * PUT /api/campaign/settings  — admin: update any subset (threshold, floor,
 *                               caps, wave size, auto-assess, auto-send).
 *
 * These control the whole engine live (no redeploy): the readiness cutoff, how
 * many investors, wave size, and the two automation kill-switches.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getCampaignSettings, updateCampaignSettings, type CampaignSettings } from "@/lib/campaign/settings"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  return NextResponse.json({ settings: await getCampaignSettings() })
}

export async function PUT(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const body = (await req.json().catch(() => ({}))) as Partial<CampaignSettings>

  const patch: Partial<CampaignSettings> = {}
  if (body.readinessThreshold != null) patch.readinessThreshold = Number(body.readinessThreshold)
  if (body.scoreFloor != null) patch.scoreFloor = Number(body.scoreFloor)
  if (body.maxInvestors != null) patch.maxInvestors = Number(body.maxInvestors)
  if (body.waveSize != null) patch.waveSize = Number(body.waveSize)
  if (typeof body.autoAssess === "boolean") patch.autoAssess = body.autoAssess
  if (typeof body.autoSend === "boolean") patch.autoSend = body.autoSend

  const settings = await updateCampaignSettings(patch, guard.email)
  return NextResponse.json({ settings })
}
