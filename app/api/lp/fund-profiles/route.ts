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
import { createClient } from "@/lib/supabase/server"
import { randomUUID } from "node:crypto"

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
    const profiles = await sql`
      SELECT * FROM fund_profiles
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 200
    `
    return NextResponse.json({ profiles: profiles.map(serialize) })
  } catch (error: any) {
    console.error("[LP Fund Profiles GET] Error:", error)
    return NextResponse.json({ error: error?.message ?? "Failed to load" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const data = (await req.json()) as UpsertBody
    if (!data?.name || !String(data.name).trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const id = data.id?.trim() || `fp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
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
        user_id, is_active, created_at, updated_at
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
        ${user?.id ?? null}, true, NOW(), NOW()
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
      RETURNING *
    `
    return NextResponse.json({ profile: serialize(upserted[0]) })
  } catch (error: any) {
    console.error("[LP Fund Profiles POST] Error:", error)
    return NextResponse.json({ error: error?.message ?? "Save failed" }, { status: 500 })
  }
}

function serialize(r: any) {
  return {
    id: r.id,
    name: r.name,
    fundNumber: r.fund_number ?? null,
    targetRaise: numOrNull(r.target_raise),
    averageTicket: numOrNull(r.average_ticket),
    avgCheckSize: numOrNull(r.avg_check_size),
    hardCap: numOrNull(r.hard_cap),
    minimumCommitment: numOrNull(r.minimum_commitment),
    fundLife: numOrNull(r.fund_life),
    managementFee: numOrNull(r.management_fee),
    carry: numOrNull(r.carry),
    gpCommitment: numOrNull(r.gp_commitment),
    investmentStage: r.investment_stage ?? null,
    targetCompanies: numOrNull(r.target_companies),
    investmentPeriod: numOrNull(r.investment_period),
    sectors: parseJsonField(r.sectors),
    primarySectors: parseJsonField(r.primary_sectors),
    geographicFocus: parseJsonField(r.geographic_focus),
    headquartersLocation: r.headquarters_location ?? null,
    targetLpTypes: parseJsonField(r.target_lp_types),
    thesisKeywords: parseJsonField(r.thesis_keywords),
    thesisDescription: r.thesis_description ?? null,
    valueProposition: r.value_proposition ?? null,
    gpName: r.gp_name ?? null,
    portfolioCompanies: parseJsonField(r.portfolio_companies),
    isActive: !!r.is_active,
    createdAt: toIso(r.created_at),
    updatedAt: toIso(r.updated_at),
  }
}

function numOrNull(v: any): number | null {
  if (v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
function parseJsonField(v: unknown): string[] {
  if (Array.isArray(v)) return v as string[]
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v)
      return Array.isArray(p) ? p : []
    } catch {
      return []
    }
  }
  return []
}
function toIso(v: any): string | null {
  if (!v) return null
  if (v instanceof Date) return v.toISOString()
  return String(v)
}
