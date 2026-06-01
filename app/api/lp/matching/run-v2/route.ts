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

    // Map fund_profiles columns to expected FundProfileV2 format
    // Actual columns: fund_name, target_fund_size, target_sectors, target_geographies
    const fund: FundProfileV2 = {
      id: (row as any).id,
      name: (row as any).fund_name ?? (row as any).name,  // fund_profiles uses fund_name
      fundNumber: undefined,
      targetRaise: (row as any).target_fund_size ?? (row as any).target_raise ?? null,
      averageTicket: null,
      sectors: jsonField(row, "target_sectors") as string[] || jsonField(row, "sectors") as string[],
      primarySectors: jsonField(row, "target_sectors") as string[] | undefined,
      geographicFocus: jsonField(row, "target_geographies") as string[] || jsonField(row, "geographic_focus") as string[],
      headquartersLocation: null,  // Not in fund_profiles table
      thesisKeywords: [],  // Not in fund_profiles table
      scoringMode: "svs_absolute",
      fundIPriorLpFirmIds: undefined,
      fundIPriorContactEmails: undefined,
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
