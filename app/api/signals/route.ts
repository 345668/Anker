/**
 * GET /api/signals?sector=&limit= — the investor-activity feed for the founder.
 * Seeds from the investor DB on first read. Defaults sector to the user's company.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import { ensureSeeded, getSignals, signalSectors } from "@/lib/signals/feed"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  await ensureSeeded()

  const url = new URL(req.url)
  let sector = url.searchParams.get("sector")
  const limit = Number(url.searchParams.get("limit") ?? 50)

  // Default the sector filter to the founder's company industry when not set.
  if (sector == null) {
    try {
      const [co] = (await sql`SELECT industry FROM companies WHERE user_id = ${user.id} AND industry IS NOT NULL ORDER BY updated_at DESC LIMIT 1`) as any[]
      if (co?.industry) sector = String(co.industry)
    } catch { /* companies table optional */ }
  }
  const useSector = sector && sector !== "all" ? sector : null

  const [signals, sectors] = await Promise.all([getSignals({ sector: useSector, limit }), signalSectors()])
  return NextResponse.json({ signals, sectors, sector: useSector })
}
