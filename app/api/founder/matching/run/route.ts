/**
 * Founder matchmaking run.
 * POST a complete StartupProfile JSON; runs the engine; caches the result;
 * returns the summary (totals, tiers, segments, funnel).
 */

import { NextRequest, NextResponse } from "next/server"
import { runFounderMatching } from "@/lib/matching/v2/founder-engine"
import { cacheSession } from "@/lib/matching/v2/founder-session-cache"
import type { StartupProfile } from "@/lib/matching/v2/founder-types"

import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { startupSchema, startupReadiness, runOptionsSchema } from "@/lib/matching/profile-readiness"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("founder")
    const body = (await req.json()) as {
      startup: StartupProfile
      minScore?: number
      maxFirms?: number
      maxContacts?: number
    }

    const parsed = startupSchema.safeParse(body.startup)
    const options = runOptionsSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "Complete the required startup fields before matching.", missingFields: startupReadiness(body.startup) }, { status: 422 })
    if (!options.success) return NextResponse.json({ error: "Invalid matching thresholds." }, { status: 422 })
    const startup: StartupProfile = {
      ...parsed.data, id: `sp_${crypto.randomUUID()}`,
      preMoneyValuation: parsed.data.preMoneyValuation ?? null,
      checkSizeIdealMin: parsed.data.checkSizeIdealMin ?? null, checkSizeIdealMax: parsed.data.checkSizeIdealMax ?? null,
    }

    console.log(`[Founder Matching] Starting run for: ${startup.name}`)

    const result = await runFounderMatching(startup, {
      minScore: body.minScore,
      maxFirms: body.maxFirms,
      maxContacts: body.maxContacts,
    })

    await cacheSession(result, startup, context)

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
    return matchingFailure(e, "Matching could not finish. Please retry.")
  }
}
