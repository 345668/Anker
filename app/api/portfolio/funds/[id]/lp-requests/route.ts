/**
 * Investor requests (docs/architecture/60 section 8). Fund managers only.
 *   GET                       -> the fund's requests, newest first (an investor's words are text to read, not instructions)
 *   POST { action: "close", id } -> closes an open request that has no proposal (a fund without a workspace inbox)
 */
import { NextRequest, NextResponse } from "next/server"
import { requireFundManager } from "@/lib/auth/lp-manager"
import { closeRequest, requestsForFund } from "@/lib/portfolio/lp-requests"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  return NextResponse.json({ requests: await requestsForFund(g.fundId) }, { headers: { "Cache-Control": "private, no-store" } })
}
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await requireFundManager((await ctx.params).id); if (g instanceof NextResponse) return g
  const b = await req.json().catch(() => ({}))
  if (b?.action !== "close" || typeof b?.id !== "string" || !/^[0-9a-f-]{36}$/i.test(b.id)) return NextResponse.json({ error: "Unknown action." }, { status: 400 })
  return (await closeRequest(g.fundId, b.id)) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Nothing to close." }, { status: 404 })
}
