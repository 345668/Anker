import { NextRequest, NextResponse } from "next/server"
import { POST as runV2 } from "../run-v2/route"
export const runtime = "nodejs"
export const maxDuration = 300
export async function POST(req: NextRequest) {
 const response = await runV2(req)
 if (!response.ok) return response
 const data = await response.json()
 return NextResponse.json({ ...data, totalFirmsScored: data.totals.rawFirms, totalContactsScored: data.totals.rawContacts,
 qualifiedFirms: data.totals.qualifiedFirms, qualifiedContacts: data.totals.qualifiedContacts,
 contactsWithEmail: data.totals.contactsWithEmail, anchorCandidates: data.totals.anchorCandidates })
}
