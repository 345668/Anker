/**
 * Founder matchmaking run (engine v3, docs/architecture/11, 14 §5–6).
 *
 * POST { startup, provenance?, minScore?, maxFirms?, maxContacts?, enableAi? }
 *   1. validates the profile (422 with the missing fields),
 *   2. saves it as a new profile version with per-field provenance,
 *   3. runs the engine for this workspace (CRM, suppressions, exclusions apply),
 *   4. persists the run and its results,
 *   5. returns the summary and the first page of firm groups and independents.
 */
import { NextRequest, NextResponse } from "next/server"
import { runFounderMatching } from "@/lib/matching/v2/founder-engine"
import { saveRun, saveProfile } from "@/lib/matching/v2/founder-runs"
import type { StartupProfile } from "@/lib/matching/v2/founder-types"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { startupSchema, startupReadiness, runOptionsSchema } from "@/lib/matching/profile-readiness"

export const runtime = "nodejs"
export const maxDuration = 300

const PROVENANCE = new Set(["deck", "typed", "workspace", "override"])

export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("founder")
    const body = (await req.json()) as Record<string, any>

    const parsed = startupSchema.safeParse(body.startup)
    const options = runOptionsSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: "Complete the required startup fields before matching.", missingFields: startupReadiness(body.startup) }, { status: 422 })
    if (!options.success) return NextResponse.json({ error: "Invalid matching options." }, { status: 422 })

    const provenance: Record<string, string> = {}
    for (const [k, v] of Object.entries(body.provenance ?? {})) if (typeof v === "string" && PROVENANCE.has(v) && k.length <= 60) provenance[k] = v
    const { id: _ignored, ...fields } = parsed.data
    const profile = await saveProfile(context, fields, provenance)

    const startup: StartupProfile = {
      ...parsed.data, id: profile.id,
      preMoneyValuation: parsed.data.preMoneyValuation ?? null,
      checkSizeIdealMin: parsed.data.checkSizeIdealMin ?? null, checkSizeIdealMax: parsed.data.checkSizeIdealMax ?? null,
    } as StartupProfile

    const result = await runFounderMatching(startup, { ...options.data, scope: context })
    await saveRun(result, startup, context, { options: options.data, profileVersionId: profile.id })

    return NextResponse.json({
      sessionId: result.sessionId,
      runId: result.sessionId,
      profileVersion: profile.version,
      startupName: result.startupName,
      ranAt: result.ranAt,
      durationMs: result.durationMs,
      engineVersion: result.engineVersion,
      totals: result.totals,
      qualifiedBeforeCap: result.qualifiedBeforeCap,
      tierCounts: result.tierCounts,
      segmentCounts: result.segmentCounts,
      funnel: result.funnel,
      semantic: result.semantic,
      exclusions: result.exclusions,
      emailVerification: result.emailVerification,
      // First page inline; the rest through /runs/[id]/results.
      topGroups: (result.groups ?? []).slice(0, 50),
      topIndependents: (result.independents ?? []).slice(0, 50),
      // Kept for the WebMCP shortlist tool.
      topFirms: result.firms.slice(0, 20),
      topContacts: result.contacts.slice(0, 20),
    })
  } catch (e: any) {
    console.error("[Founder Matching] Error:", e)
    return matchingFailure(e, "Matching could not finish. Please retry.")
  }
}
