import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { runLpMatchingV2, saveSessionV2 } from "@/lib/matching/v2"

import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { fundReadiness, runOptionsSchema } from "@/lib/matching/profile-readiness"
import { toFundProfile } from "@/lib/matching/fund-profile"

export const runtime = "nodejs"
export const maxDuration = 300 // 5 min — large datasets + AI enrichment

interface RunBody {
  fundProfileId: string
  minScore?: number
  maxFirms?: number
  maxContacts?: number
  enableAi?: boolean
}

export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("vc")

    const body = (await req.json()) as RunBody
    if (!body.fundProfileId) {
      return NextResponse.json({ error: "fundProfileId is required" }, { status: 400 })
    }

    const options = runOptionsSchema.safeParse(body)
    if (!options.success) return NextResponse.json({ error: "Use a score between 0 and 150 and result limits between 1 and 10,000." }, { status: 422 })

    // Load fund profile
    const [row] = await sql`
      SELECT * FROM fund_profiles
      WHERE id = ${body.fundProfileId} AND is_active = true AND user_id = ${context.userId} AND org_id = ${context.orgId}
      LIMIT 1
    `
    if (!row) {
      return NextResponse.json({ error: "Fund profile not found" }, { status: 404 })
    }

    const fund = toFundProfile(row)
    const missingFields = fundReadiness(fund)
    if (missingFields.length) return NextResponse.json({ error: "Complete the required fund fields before matching.", missingFields }, { status: 422 })

    console.log(`[LP Matching v2] Starting run for fund: ${fund.name}`)

    const result = await runLpMatchingV2(fund, {
      minScore: body.minScore,
      maxFirms: body.maxFirms,
      maxContacts: body.maxContacts,
      enableAi: body.enableAi,
    })

    await saveSessionV2(result, context.userId)

    // Return summary only (full lists can be fetched via session endpoint)
    return NextResponse.json({
      sessionId: result.sessionId,
      fundProfileId: result.fundProfileId,
      fundName: result.fundName,
      ranAt: result.ranAt,
      durationMs: result.durationMs,
      totals: result.totals,
      tierCounts: result.tierCounts,
      segmentCounts: result.segmentCounts,
      funnel: result.funnel,
    })
  } catch (error: any) {
    console.error("[LP Matching v2] Error:", error)
    return matchingFailure(error, "Matching could not finish. Please retry; if this continues, check the matching database migrations.")
  }
}
