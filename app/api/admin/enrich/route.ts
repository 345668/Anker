/**
 * POST /api/admin/enrich
 *   { firmId | investorId, overwrite?: boolean, maxPages?: number }
 *
 * GET  /api/admin/enrich?kind=firm|investor&limit=50
 *   List of candidates the bulk UI can iterate.
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  enrichFirm,
  enrichInvestor,
  findEnrichmentCandidates,
} from "@/lib/admin/enrichment"

export const runtime = "nodejs"
export const maxDuration = 240

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const url = new URL(req.url)
    const kind = (url.searchParams.get("kind") ?? "firm") as "firm" | "investor"
    const limit = Number(url.searchParams.get("limit")) || 50
    const candidates = await findEnrichmentCandidates({ kind, limit })
    return NextResponse.json({ kind, candidates })
  } catch (e: any) {
    console.error("[admin/enrich GET] error:", e)
    return NextResponse.json({ error: e?.message ?? "list failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()
    if (body?.firmId) {
      const r = await enrichFirm({
        firmId: String(body.firmId),
        overwrite: !!body.overwrite,
        maxPages: Number(body.maxPages) || undefined,
      })
      return NextResponse.json(r)
    }
    if (body?.investorId) {
      const r = await enrichInvestor({
        investorId: String(body.investorId),
        overwrite: !!body.overwrite,
        maxPages: Number(body.maxPages) || undefined,
      })
      return NextResponse.json(r)
    }
    return NextResponse.json({ error: "firmId or investorId required" }, { status: 400 })
  } catch (e: any) {
    console.error("[admin/enrich POST] error:", e)
    return NextResponse.json({ error: e?.message ?? "enrich failed" }, { status: 500 })
  }
}
