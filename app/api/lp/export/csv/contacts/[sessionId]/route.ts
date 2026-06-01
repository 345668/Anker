import { NextRequest, NextResponse } from "next/server";
import { getLpSession, type ScoredContact } from "@/lib/matching/lp-matchmaking";
import { generateLpContactsCsv } from "@/lib/matching/xlsx-generator";

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
    
    const contacts: ScoredContact[] = result.contacts.map((c: any) => {
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
        tier: c.tier ?? "",
        tierLabel: "",
        tags,
        reasons,
        factorLpType: 0,
        factorSector: 0,
        factorGeo: 0,
        factorThesisSignals: 0,
        factorContactQuality: 0,
      };
    });
    
    const csv = generateLpContactsCsv(contacts);
    
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="lp_contacts_${sessionId}.csv"`,
      },
    });
  } catch (error: any) {
    console.error("[LP Export CSV Contacts] Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
