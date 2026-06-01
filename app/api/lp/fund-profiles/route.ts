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
    // fund_profiles table uses different column names than expected
    const profiles = await sql`
      SELECT * FROM fund_profiles
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
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const data = (await req.json()) as UpsertBody
    if (!data?.name || !String(data.name).trim()) {
      return NextResponse.json({ error: "name is required" }, { status: 400 })
    }

    const id = data.id?.trim() || randomUUID()

    // UPSERT using actual fund_profiles columns
    const upserted = await sql`
      INSERT INTO fund_profiles (
        id, user_id, fund_name, fund_type, target_fund_size,
        target_sectors, target_stages, target_geographies,
        min_track_record_years, preferred_gp_experience,
        esg_focus, first_time_fund_ok, co_investment_rights,
        notes, created_at, updated_at
      ) VALUES (
        ${id}, ${user.id}, ${String(data.name).trim()}, 
        ${data.investmentStage ?? null},
        ${data.targetRaise ?? null},
        ${data.sectors ?? []}, ${data.primarySectors ?? []}, ${data.geographicFocus ?? []},
        ${null}, ${[]},
        ${false}, ${true}, ${false},
        ${data.thesisDescription ?? null}, NOW(), NOW()
      )
      ON CONFLICT (id) DO UPDATE SET
        fund_name           = EXCLUDED.fund_name,
        fund_type           = EXCLUDED.fund_type,
        target_fund_size    = EXCLUDED.target_fund_size,
        target_sectors      = EXCLUDED.target_sectors,
        target_stages       = EXCLUDED.target_stages,
        target_geographies  = EXCLUDED.target_geographies,
        notes               = EXCLUDED.notes,
        updated_at          = NOW()
      RETURNING *
    `
    return NextResponse.json({ profile: serialize(upserted[0]) })
  } catch (error: any) {
    console.error("[LP Fund Profiles POST] Error:", error)
    return NextResponse.json({ error: error?.message ?? "Save failed" }, { status: 500 })
  }
}

function serialize(r: any) {
  // Map actual fund_profiles columns to expected API response format
  return {
    id: r.id,
    name: r.fund_name,  // table uses fund_name
    fundNumber: null,
    targetRaise: numOrNull(r.target_fund_size),  // table uses target_fund_size
    averageTicket: null,
    avgCheckSize: null,
    hardCap: null,
    minimumCommitment: null,
    fundLife: null,
    managementFee: null,
    carry: null,
    gpCommitment: null,
    investmentStage: r.fund_type ?? null,
    targetCompanies: null,
    investmentPeriod: null,
    sectors: parseJsonField(r.target_sectors),  // table uses target_sectors
    primarySectors: parseJsonField(r.target_sectors),
    geographicFocus: parseJsonField(r.target_geographies),  // table uses target_geographies
    headquartersLocation: null,
    targetLpTypes: [],
    thesisKeywords: [],
    thesisDescription: r.notes ?? null,
    valueProposition: null,
    gpName: null,
    portfolioCompanies: [],
    isActive: true,
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
