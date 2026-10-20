import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { openMaterial } from "@/lib/investor/materials"

export const runtime = "nodejs"
/** Opens one granted document: checks the grant, the open conversation and the NDA, writes the access log, then redirects to the file. */
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try { const c = await investorContext(), p = await params; return NextResponse.redirect(await openMaterial(c.userId, c.email, p.id, p.docId), 302) } catch (e) { return investorFailure(e) }
}
