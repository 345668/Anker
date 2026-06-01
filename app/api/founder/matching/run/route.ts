/**
 * Founder matchmaking run.
 * POST a complete StartupProfile JSON; runs the engine; caches the result;
 * returns the summary (totals, tiers, segments, funnel).
 */

import { NextRequest, NextResponse } from "next/server"
import { runFounderMatching } from "@/lib/matching/v2/founder-engine"
import { cacheSession } from "@/lib/matching/v2/founder-session-cache"
import type { StartupProfile } from "@/lib/matching/v2/founder-types"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      startup: StartupProfile
      minScore?: number
      maxFirms?: number
      maxContacts?: number
    }

    if (!body.startup?.name || !body.startup?.stage) {
      return NextResponse.json(
        { error: "startup.name and startup.stage are required" },
        { status: 400 },
      )
    }

    const startup: StartupProfile = {
      ...body.startup,
      id: body.startup.id ?? `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      sectors: Array.isArray(body.startup.sectors) ? body.startup.sectors : [],
      thesisKeywords: Array.isArray(body.startup.thesisKeywords) ? body.startup.thesisKeywords : [],
    }

    console.log(`[Founder Matching] Starting run for: ${startup.name}`)

    const result = await runFounderMatching(startup, {
      minScore: body.minScore,
      maxFirms: body.maxFirms,
      maxContacts: body.maxContacts,
    })

    cacheSession(result, startup)

    return NextResponse.json({
      sessionId: result.sessionId,
      startupProfileId: result.startupProfileId,
      startupName: result.startupName,
      ranAt: result.ranAt,
      durationMs: result.durationMs,
      totals: result.totals,
      tierCounts: result.tierCounts,
      segmentCounts: result.segmentCounts,
      funnel: result.funnel,
      // Top 20 firms + 20 contacts inline for the immediate UI render
      topFirms: result.firms.slice(0, 20),
      topContacts: result.contacts.slice(0, 20),
    })
  } catch (e: any) {
    console.error("[Founder Matching] Error:", e)
    return NextResponse.json({ error: e?.message ?? "Unknown" }, { status: 500 })
  }
}
