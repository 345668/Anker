import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { InvestorError } from "@/lib/investor/profile"
import { addDocument, passportOf, removeDocument } from "@/lib/investor/passport"

export const runtime = "nodejs"
type Ctx = { params: Promise<{ id: string }> }
export async function GET(_r: NextRequest, { params }: Ctx) { try { const c = await investorContext(); return NextResponse.json(await passportOf(c.userId, (await params).id)) } catch (e) { return investorFailure(e) } }
/** multipart: docType, file */
export async function POST(req: NextRequest, { params }: Ctx) {
  try {
    const c = await investorContext(), f = await req.formData(), file = f.get("file")
    if (!(file instanceof File)) throw new InvestorError("Choose a file.")
    await addDocument(c.userId, (await params).id, f.get("docType"), { filename: file.name, bytes: Buffer.from(await file.arrayBuffer()) })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e) { return investorFailure(e) }
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try { const c = await investorContext(); await removeDocument(c.userId, (await params).id, req.nextUrl.searchParams.get("docId") ?? ""); return NextResponse.json({ ok: true }) } catch (e) { return investorFailure(e) }
}
