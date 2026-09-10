/**
 * Fund-profile CRUD for the LP-matchmaking page.
 *
 *   GET   /api/lp/fund-profiles   — list active profiles (consumed by the
 *                                    profile picker + the inline editor)
 *   POST  /api/lp/fund-profiles   — UPSERT.  If `id` is supplied, we
 *                                    update; otherwise we insert with a
 *                                    new id.  Returns the saved row.
 *
 * Touches the columns the v2 matching engine actually reads
 * (FundProfileV2): name, fund_number, target_raise, average_ticket,
 * sectors, primary_sectors, geographic_focus, headquarters_location,
 * thesis_keywords.  Plus the diligence fields LPs care about (mgmt fee,
 * carry, GP commit, thesis description, GP name, portfolio) so the
 * deck-extraction flow has somewhere to land each field.
 */

import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { serializeFundProfile } from "@/lib/matching/fund-profile"
import { randomUUID } from "node:crypto"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { fundDraftSchema } from "@/lib/matching/profile-readiness"

export const runtime = "nodejs"

interface UpsertBody {
  id?: string
  name: string
  fundNumber?: number | null
  targetRaise?: number | null
  averageTicket?: number | null
  avgCheckSize?: number | null
  hardCap?: number | null
  minimumCommitment?: number | null
  managementFee?: number | null
  carry?: number | null
  gpCommitment?: number | null
  fundLife?: number | null
  investmentStage?: string | null
  targetCompanies?: number | null
  investmentPeriod?: number | null
  sectors?: string[]
  primarySectors?: string[]
  geographicFocus?: string[]
  headquartersLocation?: string | null
  targetLpTypes?: string[]
  thesisKeywords?: string[]
  thesisDescription?: string | null
  valueProposition?: string | null
  gpName?: string | null
  portfolioCompanies?: string[]
}

export async function GET() {
  try {
    const context = await matchingContext("vc")
    const profiles = await sql`
      SELECT * FROM fund_profiles
      WHERE is_active = true AND user_id = ${context.userId} AND org_id = ${context.orgId}
      ORDER BY created_at DESC
      LIMIT 200
    `
    return NextResponse.json({ profiles: profiles.map(serializeFundProfile) })
  } catch (error: any) {
    console.error("[LP Fund Profiles GET] Error:", error)
    return matchingFailure(error, "Profiles are temporarily unavailable. Please retry.")
  }
}

export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("vc")
    const parsed = fundDraftSchema.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 422 })
    const data = parsed.data
    const id = data.id?.trim() || `fp_${randomUUID()}`
    const sectorsJson = JSON.stringify(data.sectors ?? [])
    const primarySectorsJson = JSON.stringify(data.primarySectors ?? data.sectors?.slice(0, 3) ?? [])
    const geoJson = JSON.stringify(data.geographicFocus ?? [])
    const lpTypesJson = JSON.stringify(data.targetLpTypes ?? [])
    const thesisKeywordsJson = JSON.stringify(data.thesisKeywords ?? [])
    const portfolioJson = JSON.stringify(data.portfolioCompanies ?? [])

    // UPSERT.  Re-uses ON CONFLICT (id) so the same endpoint handles
    // create + edit + deck-extract auto-fill without the UI having to
    // distinguish them.  PGlite supports ON CONFLICT.
    const upserted = await sql`
      INSERT INTO fund_profiles (
        id, name, fund_number, target_raise, hard_cap, minimum_commitment, fund_life,
        average_ticket, management_fee, carry, gp_commitment,
        investment_stage, avg_check_size, target_companies, investment_period,
        sectors, primary_sectors, geographic_focus, headquarters_location,
        target_lp_types, thesis_description, thesis_keywords, value_proposition,
        gp_name, portfolio_companies,
        user_id, org_id, is_active, created_at, updated_at
      ) VALUES (
        ${id}, ${String(data.name).trim()}, ${data.fundNumber ?? null},
        ${data.targetRaise ?? null}, ${data.hardCap ?? null},
        ${data.minimumCommitment ?? null}, ${data.fundLife ?? null},
        ${data.averageTicket ?? null}, ${data.managementFee ?? null},
        ${data.carry ?? null}, ${data.gpCommitment ?? null},
        ${data.investmentStage ?? null}, ${data.avgCheckSize ?? null},
        ${data.targetCompanies ?? null}, ${data.investmentPeriod ?? null},
        ${sectorsJson}::jsonb, ${primarySectorsJson}::jsonb,
        ${geoJson}::jsonb, ${data.headquartersLocation ?? null},
        ${lpTypesJson}::jsonb, ${data.thesisDescription ?? null},
        ${thesisKeywordsJson}::jsonb, ${data.valueProposition ?? null},
        ${data.gpName ?? null}, ${portfolioJson}::jsonb,
        ${context.userId}, ${context.orgId}, true, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        name                  = EXCLUDED.name,
        fund_number           = EXCLUDED.fund_number,
        target_raise          = EXCLUDED.target_raise,
        hard_cap              = EXCLUDED.hard_cap,
        minimum_commitment    = EXCLUDED.minimum_commitment,
        fund_life             = EXCLUDED.fund_life,
        average_ticket        = EXCLUDED.average_ticket,
        management_fee        = EXCLUDED.management_fee,
        carry                 = EXCLUDED.carry,
        gp_commitment         = EXCLUDED.gp_commitment,
        investment_stage      = EXCLUDED.investment_stage,
        avg_check_size        = EXCLUDED.avg_check_size,
        target_companies      = EXCLUDED.target_companies,
        investment_period     = EXCLUDED.investment_period,
        sectors               = EXCLUDED.sectors,
        primary_sectors       = EXCLUDED.primary_sectors,
        geographic_focus      = EXCLUDED.geographic_focus,
        headquarters_location = EXCLUDED.headquarters_location,
        target_lp_types       = EXCLUDED.target_lp_types,
        thesis_description    = EXCLUDED.thesis_description,
        thesis_keywords       = EXCLUDED.thesis_keywords,
        value_proposition     = EXCLUDED.value_proposition,
        gp_name               = EXCLUDED.gp_name,
        portfolio_companies   = EXCLUDED.portfolio_companies,
        is_active             = true,
        updated_at            = NOW()
      WHERE fund_profiles.user_id = ${context.userId} AND fund_profiles.org_id = ${context.orgId}
      RETURNING *
    `
    if (!upserted.length) return NextResponse.json({ error: "Profile not found in this workspace." }, { status: 404 })
    return NextResponse.json({ profile: serializeFundProfile(upserted[0]) })
  } catch (error: any) {
    console.error("[LP Fund Profiles POST] Error:", error)
    return matchingFailure(error, "Profile could not be saved. Your entries are still here; please retry.")
  }
}
