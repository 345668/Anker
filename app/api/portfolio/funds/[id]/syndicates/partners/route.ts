/**
 * POST   /api/portfolio/funds/[id]/syndicates/partners  → upsert a partner
 *   Body: { id?, name, firm?, email?, partnerType?, sectors?,
 *           typicalTicket?, notes? }
 * DELETE /api/portfolio/funds/[id]/syndicates/partners?partnerId=…
 * Admin-gated. [id] is the LEAD fund.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { upsertPartner, deletePartner, listPartners } from "@/lib/portfolio/syndication"

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 })
    }
    const partner = await upsertPartner({
      id: body.id ?? null,
      leadFundId: fundId,
      name: body.name,
      firm: body.firm ?? null,
      email: body.email ?? null,
      partnerType: body.partnerType,
      sectors: body.sectors ?? null,
      typicalTicket: body.typicalTicket != null ? Number(body.typicalTicket) : null,
      notes: body.notes ?? null,
    })
    const partners = await listPartners(fundId)
    return NextResponse.json({ partner, partners }, { status: body.id ? 200 : 201 })
  } catch (e: any) {
    console.error("[syndicate partners POST]", e)
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const partnerId = new URL(req.url).searchParams.get("partnerId")
  if (!partnerId) return NextResponse.json({ error: "partnerId required" }, { status: 400 })
  const ok = await deletePartner(partnerId, fundId)
  if (!ok) return NextResponse.json({ error: "Partner not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
