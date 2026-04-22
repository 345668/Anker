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

// PATCH update fund profile
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await req.json();
    
    // Build dynamic update query
    const updates: string[] = [];
    const values: any[] = [];
    
    if (data.name !== undefined) updates.push(`name = $${values.push(data.name)}`);
    if (data.targetRaise !== undefined) updates.push(`target_raise = $${values.push(data.targetRaise)}`);
    if (data.sectors !== undefined) updates.push(`sectors = $${values.push(JSON.stringify(data.sectors))}`);
    if (data.geographicFocus !== undefined) updates.push(`geographic_focus = $${values.push(JSON.stringify(data.geographicFocus))}`);
    if (data.headquartersLocation !== undefined) updates.push(`headquarters_location = $${values.push(data.headquartersLocation)}`);
    if (data.thesisKeywords !== undefined) updates.push(`thesis_keywords = $${values.push(JSON.stringify(data.thesisKeywords))}`);
    if (data.thesisDescription !== undefined) updates.push(`thesis_description = $${values.push(data.thesisDescription)}`);
    if (data.scoringWeights !== undefined) updates.push(`scoring_weights = $${values.push(JSON.stringify(data.scoringWeights))}`);
    
    updates.push(`updated_at = NOW()`);
    
    await sql`
      UPDATE fund_profiles 
      SET ${sql.unsafe(updates.join(', '))}
      WHERE id = ${id}
    `;
    
    const [updated] = await sql`SELECT * FROM fund_profiles WHERE id = ${id}`;
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE (soft delete) fund profile
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await sql`
      UPDATE fund_profiles SET is_active = false, updated_at = NOW() WHERE id = ${id}
    `;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
