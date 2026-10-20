import { NextRequest, NextResponse } from "next/server"
import { fundContext, investorFailure } from "@/lib/investor/access"
import { InvestorError } from "@/lib/investor/profile"
import { grantMaterial, materialsForFund, revokeMaterial } from "@/lib/investor/materials"

export const runtime = "nodejs"
type Ctx = { params: Promise<{ id: string }> }
export async function GET(_r: NextRequest, { params }: Ctx) { try { const c = await fundContext(); return NextResponse.json(await materialsForFund(c.fund.fundId, (await params).id)) } catch (e) { return investorFailure(e) } }
/** { action: "grant", documentId } or { action: "revoke", grantId } */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const c = await fundContext(true), b = await req.json(), id = (await params).id
    if (b?.action === "grant") await grantMaterial(c.fund.fundId, id, String(b.documentId ?? ""), c.userId)
    else if (b?.action === "revoke") await revokeMaterial(c.fund.fundId, id, String(b.grantId ?? ""))
    else throw new InvestorError("Choose grant or revoke.")
    return NextResponse.json({ ok: true })
  } catch (e) { return investorFailure(e) }
}
