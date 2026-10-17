/** GET /api/portfolio/lp-documents/[docId] — a published investor document, for the fund that owns it. Fund managers only. */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireFundManager } from "@/lib/auth/lp-manager"
import { documentForFund } from "@/lib/portfolio/lp-statement"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ docId: string }> }) {
  const { docId } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const [r] = (await sql`SELECT fund_id FROM lp_documents WHERE id = ${docId}::uuid`) as any[]
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const g = await requireFundManager(String(r.fund_id)); if (g instanceof NextResponse) return g
  const d = await documentForFund(g.fundId, docId); if (!d) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return new NextResponse(new Uint8Array(d.bytes), { headers: { "content-type": d.contentType, "content-disposition": `attachment; filename="${d.filename.replace(/[^\w.\- ]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } })
}
