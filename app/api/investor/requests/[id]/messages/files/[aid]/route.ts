import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { attachmentFor } from "@/lib/investor/talks"

export const runtime = "nodejs"
/** One attachment of this conversation, as a download. */
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string; aid: string }> }) {
  try {
    const p = await params
    const c = await investorContext(); const f = await attachmentFor("investor", { userId: c.userId }, p.id, p.aid)
    return new NextResponse(new Uint8Array(f.bytes), { headers: { "Content-Type": f.contentType, "Content-Disposition": `attachment; filename="${f.filename}"`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" } })
  } catch (e) { return investorFailure(e) }
}
