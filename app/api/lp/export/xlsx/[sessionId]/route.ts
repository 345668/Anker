import { NextRequest, NextResponse } from "next/server";
import { getLpSession, type ScoredFirm, type ScoredContact, type LpMatchingResult } from "@/lib/matching/lp-matchmaking";
import { generateLpPipelineXlsx } from "@/lib/matching/xlsx-generator";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    const result = await getLpSession(sessionId);
    
    if (!result) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    
    // Map database rows back to LpMatchingResult format
    const session = result.session as any;
    const tierCounts = typeof session.tier_counts === "string" 
      ? JSON.parse(session.tier_counts) 
      : (session.tier_counts || { firms: {}, contacts: {} });
    
    const matchingResult: LpMatchingResult = {
      sessionId: session.id,
      fundName: session.fund_name ?? "Fund",
      totalFirmsScored: session.total_firms_scored ?? 0,
      totalContactsScored: session.total_contacts_scored ?? 0,
      qualifiedFirms: result.firms.length,
      qualifiedContacts: result.contacts.length,
      contactsWithEmail: result.contacts.filter((c: any) => c.contact_email).length,
      anchorCandidates: result.firms.filter((f: any) => {
        const tags = typeof f.tags === "string" ? JSON.parse(f.tags) : (f.tags || []);
        return tags.includes("ANCHOR");
      }).length,
      durationMs: session.duration_ms ?? 0,
      tierCounts,
      firms: result.firms.map((f: any): ScoredFirm => {
        const tags = typeof f.tags === "string" ? JSON.parse(f.tags) : (f.tags || []);
        const reasons = typeof f.reasons === "string" ? JSON.parse(f.reasons) : (f.reasons || []);
        return {
          firmId: f.firm_id,
          name: f.firm_name ?? "",
          type: f.firm_type ?? "",
          location: f.firm_location ?? "",
          aum: f.firm_aum ?? "",
          sectors: f.firm_sectors ?? "",
          website: f.firm_website ?? "",
          linkedin: f.firm_linkedin ?? "",
          score: f.score,
          tier: f.tier ?? "C",
          tierLabel: f.tier ?? "",
          tags,
          reasons,
          factorLpType: f.factor_lp_type ?? 0,
          factorAum: f.factor_aum ?? 0,
          factorSector: f.factor_sector ?? 0,
          factorGeo: f.factor_geo ?? 0,
          factorThesisSignals: f.factor_thesis_signals ?? 0,
        };
      }),
      contacts: result.contacts.map((c: any): ScoredContact => {
        const tags = typeof c.tags === "string" ? JSON.parse(c.tags) : (c.tags || []);
        const reasons = typeof c.reasons === "string" ? JSON.parse(c.reasons) : (c.reasons || []);
        return {
          investorId: c.investor_id,
          name: c.contact_name ?? "",
          title: c.contact_title ?? "",
          type: c.contact_type ?? "",
          location: c.contact_location ?? "",
          email: c.contact_email ?? "",
          linkedin: c.contact_linkedin ?? "",
          sectors: c.contact_sectors ?? "",
          bio: "",
          score: c.score,
          tier: c.tier ?? "C",
          tierLabel: c.tier ?? "",
          tags,
          reasons,
          factorLpType: c.factor_lp_type ?? 0,
          factorSector: c.factor_sector ?? 0,
          factorGeo: c.factor_geo ?? 0,
          factorThesisSignals: c.factor_thesis_signals ?? 0,
          factorContactQuality: c.factor_contact_quality ?? 0,
        };
      }),
    };
    
    const buffer = generateLpPipelineXlsx(matchingResult);
    
    const filename = `LP_Pipeline_${session.fund_name?.replace(/\s+/g, "_") ?? "Fund"}_${new Date().toISOString().split("T")[0]}.xlsx`;
    
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("[LP Export XLSX] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
