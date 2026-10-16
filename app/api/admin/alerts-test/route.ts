/**
 * POST /api/admin/alerts-test — sends a test notification on every switched-on alert channel and reports each result (docs/architecture/56). Portal service principal only.
 * The report holds no secrets: a channel's error text is redacted before it gets here.
 */
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { defaultChannels, sendTestNotification } from "@/lib/ops/alerts/engine"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function POST() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  if (guard.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  const channels = defaultChannels()
  return NextResponse.json({ configured: channels.map((c) => c.name), results: await sendTestNotification(channels) })
}
