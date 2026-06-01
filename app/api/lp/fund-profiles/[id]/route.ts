import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";

// GET single fund profile
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const [profile] = await sql`
      SELECT * FROM fund_profiles WHERE id = ${id} LIMIT 1
    `;
    
    if (!profile) {
      return NextResponse.json({ error: "Fund profile not found" }, { status: 404 });
    }
    
    return NextResponse.json(profile);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH update fund profile - using actual fund_profiles table columns
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await req.json();
    
    // Map API fields to actual database columns
    // fund_profiles table columns: id, user_id, fund_name, fund_type, target_fund_size,
    // target_sectors, target_stages, target_geographies, min_track_record_years,
    // preferred_gp_experience, esg_focus, first_time_fund_ok, co_investment_rights,
    // notes, created_at, updated_at
    
    await sql`
      UPDATE fund_profiles SET
        fund_name = COALESCE(${data.name ?? null}, fund_name),
        target_fund_size = COALESCE(${data.targetRaise ?? null}, target_fund_size),
        target_sectors = COALESCE(${data.sectors ?? null}, target_sectors),
        target_geographies = COALESCE(${data.geographicFocus ?? null}, target_geographies),
        notes = COALESCE(${data.thesisDescription ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${id}
    `;
    
    const [updated] = await sql`SELECT * FROM fund_profiles WHERE id = ${id}`;
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE fund profile
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Actual delete since is_active column doesn't exist
    await sql`DELETE FROM fund_profiles WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
