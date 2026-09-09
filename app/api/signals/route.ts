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

  // Default the sector filter to the founder's own sector when not set.
  // The founder entity is `startups`, keyed by founder_id (see
  // lib/db/platform-queries.ts). `industries` is a jsonb array and is the
  // populated field; `niche_industry` is the free-text fallback.
  let autoSector = false
  if (sector == null) {
    autoSector = true
    try {
      const [co] = (await sql`
        SELECT COALESCE(industries->>0, niche_industry) AS sector
        FROM startups
        WHERE founder_id = ${user.id}
          AND COALESCE(industries->>0, niche_industry) IS NOT NULL
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `) as any[]
      if (co?.sector) sector = String(co.sector)
    } catch (e: any) {
      // Never let personalization break the feed — but don't swallow silently.
      console.error("[signals] sector personalization failed:", e?.message)
    }
  }
  let useSector = sector && sector !== "all" ? sector : null

  let [signals, sectors] = await Promise.all([getSignals({ sector: useSector, limit }), signalSectors()])

  // The founder's own taxonomy ("AI / Machine Learning") and the derived signal
  // sectors ("Technology", "SaaS") don't share a vocabulary, so an auto-derived
  // sector can match nothing. Never hand a founder an empty feed for a filter
  // they didn't choose — fall back to the general feed. An EXPLICIT filter is
  // left honest (empty means empty, and the UI lets them clear it).
  if (autoSector && useSector && signals.length === 0) {
    useSector = null
    signals = await getSignals({ sector: null, limit })
  }

  return NextResponse.json({ signals, sectors, sector: useSector })
}
