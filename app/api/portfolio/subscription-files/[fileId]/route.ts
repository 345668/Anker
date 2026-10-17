/** GET /api/portfolio/subscription-files/[fileId] — a package document or an LP's signed copy, for the fund that owns it (docs/architecture/60). Fund managers only. */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireFundManager } from "@/lib/auth/lp-manager"
import { fileForFund } from "@/lib/portfolio/lp-subscription"

export const runtime = "nodejs"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await ctx.params
  if (!/^[0-9a-f-]{36}$/i.test(fileId)) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const [r] = (await sql`SELECT fund_id FROM lp_subscription_files WHERE id = ${fileId}::uuid`) as any[]
  if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const g = await requireFundManager(String(r.fund_id)); if (g instanceof NextResponse) return g
  const f = await fileForFund(g.fundId, fileId); if (!f) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return new NextResponse(new Uint8Array(f.bytes), { headers: { "content-type": f.contentType, "content-disposition": `attachment; filename="${f.filename.replace(/[^\w.\- ]/g, "_")}"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } })
}
