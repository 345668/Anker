/**
 * GET  /api/portfolio/funds/[id]/syndicates   → { syndicates, partners }
 * POST /api/portfolio/funds/[id]/syndicates   → create an SPV
 *   Body: { dealId?, companyName?, allocationAmount?, minTicket?,
 *           carryToLeadPct?, platformFeePct?, targetCloseDate?, notes? }
 * Admin-gated. [id] is the LEAD fund (uuid or slug).
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  listSyndicates, listPartners, createSpvForDeal, hasSyndicationTables,
} from "@/lib/portfolio/syndication"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const fund = UUID_RE.test(trimmed)
    ? (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
    : await getFundBySlug(trimmed)
  return fund?.id ?? null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const [syndicates, partners] = await Promise.all([
    listSyndicates(fundId), listPartners(fundId),
  ])
  return NextResponse.json({ syndicates, partners })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  if (!(await hasSyndicationTables())) {
    return NextResponse.json(
      { error: "syndication tables missing — run scripts/oneshot/run-syndication-tables.mjs first." },
      { status: 503 },
    )
  }
  try {
    const body = await req.json()
    const syndicate = await createSpvForDeal({
      leadFundId: fundId,
      dealId: body.dealId ?? null,
      companyName: body.companyName ?? null,
      allocationAmount: body.allocationAmount != null ? Number(body.allocationAmount) : null,
      minTicket: body.minTicket != null ? Number(body.minTicket) : null,
      carryToLeadPct: body.carryToLeadPct != null ? Number(body.carryToLeadPct) : undefined,
      platformFeePct: body.platformFeePct != null ? Number(body.platformFeePct) : undefined,
      targetCloseDate: body.targetCloseDate ?? null,
      notes: body.notes ?? null,
      createdBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json(syndicate, { status: 201 })
  } catch (e: any) {
    console.error("[syndicates POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}
