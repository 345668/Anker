import { NextRequest, NextResponse } from "next/server"
import { investorContext, investorFailure } from "@/lib/investor/access"
import { ownCopy } from "@/lib/investor/passport"

export const runtime = "nodejs"
/** The investor's own copy of one passport document (?docId=). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const c = await investorContext(), f = await ownCopy(c.userId, (await params).id, req.nextUrl.searchParams.get("docId") ?? "")
    return new NextResponse(new Uint8Array(f.bytes), { headers: { "Content-Type": f.contentType, "Content-Disposition": `attachment; filename="${f.filename}"`, "Cache-Control": "private, no-store" } })
  } catch (e) { return investorFailure(e) }
}
