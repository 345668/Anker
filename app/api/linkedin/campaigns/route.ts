/**
 * /api/linkedin/campaigns — list + create LinkedIn campaigns (dashboard-facing).
 *   GET  → { ok, campaigns }
 *   POST → { ok, campaign }   { name, senderId?, fullAuto? }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { listCampaigns, createCampaign } from "@/lib/linkedin/campaigns"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  return NextResponse.json({ ok: true, campaigns: await listCampaigns(auth.id) })
}

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const body = await req.json().catch(() => ({}))
  try {
    const campaign = await createCampaign(auth.id, {
      name: body.name,
      senderId: body.senderId,
      fullAuto: body.fullAuto,
    })
    return NextResponse.json({ ok: true, campaign })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || "Failed to create campaign" }, { status: 400 })
  }
}
