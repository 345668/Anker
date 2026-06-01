import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { createClient } from "@/lib/supabase/server"
import {
  runLpMatchingV2,
  saveSessionV2,
  type FundProfileV2,
} from "@/lib/matching/v2"

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
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const body = (await req.json()) as RunBody
    if (!body.fundProfileId) {
      return NextResponse.json({ error: "fundProfileId is required" }, { status: 400 })
    }

    // Load fund profile
    const [row] = await sql`
      SELECT * FROM fund_profiles
      WHERE id = ${body.fundProfileId} AND is_active = true
      LIMIT 1
    `
    if (!row) {
      return NextResponse.json({ error: "Fund profile not found" }, { status: 404 })
    }

    const fund: FundProfileV2 = {
      id: (row as any).id,
      name: (row as any).name,
      fundNumber: (row as any).fund_number ?? undefined,
      targetRaise: (row as any).target_raise ?? null,
      averageTicket: (row as any).average_ticket ?? null,
      sectors: jsonField(row, "sectors") as string[],
      primarySectors: jsonField(row, "primary_sectors") as string[] | undefined,
      geographicFocus: jsonField(row, "geographic_focus") as string[],
      headquartersLocation: (row as any).headquarters_location ?? null,
      thesisKeywords: jsonField(row, "thesis_keywords") as string[],
      scoringMode: "svs_absolute",
      fundIPriorLpFirmIds: jsonField(row, "fund_i_prior_lp_firm_ids") as string[] | undefined,
      fundIPriorContactEmails: jsonField(row, "fund_i_prior_contact_emails") as string[] | undefined,
    }

    console.log(`[LP Matching v2] Starting run for fund: ${fund.name}`)

    const result = await runLpMatchingV2(fund, {
      minScore: body.minScore,
      maxFirms: body.maxFirms,
      maxContacts: body.maxContacts,
      enableAi: body.enableAi,
    })

    await saveSessionV2(result, user?.id)

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
    return NextResponse.json(
      { error: error?.message ?? "Unknown error" },
      { status: 500 },
    )
  }
}

function jsonField(row: any, field: string): unknown {
  const v = row?.[field]
  if (v == null) return []
  if (Array.isArray(v)) return v
  if (typeof v === "string") {
    try {
      return JSON.parse(v)
    } catch {
      return []
    }
  }
  return v
}
