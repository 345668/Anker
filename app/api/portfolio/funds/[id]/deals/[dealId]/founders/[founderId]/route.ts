/**
 * PATCH  /api/portfolio/funds/[id]/deals/[dealId]/founders/[founderId]
 *   Body: field patch, and/or { setPrimary: true } to make this the primary founder.
 * DELETE /api/portfolio/funds/[id]/deals/[dealId]/founders/[founderId]
 *
 * Admin-gated. Verifies the deal belongs to the fund and the founder to the deal.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getDealById } from "@/lib/portfolio/deal-pipeline"
import {
  getFounder, updateFounder, deleteFounder, setPrimaryFounder, listFounders,
} from "@/lib/portfolio/deal-founders"

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

async function loadScoped(id: string, dealId: string, founderId: string) {
  const fundId = await resolveFundId(id)
  if (!fundId) return { error: NextResponse.json({ error: "Fund not found" }, { status: 404 }) }
  const deal = await getDealById(dealId)
  if (!deal || deal.fund_id !== fundId) {
    return { error: NextResponse.json({ error: "Deal not found" }, { status: 404 }) }
  }
  const founder = await getFounder(founderId)
  if (!founder || founder.deal_id !== dealId) {
    return { error: NextResponse.json({ error: "Founder not found" }, { status: 404 }) }
  }
  return { fundId, deal, founder }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; dealId: string; founderId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, dealId, founderId } = await ctx.params
  const scoped = await loadScoped(id, dealId, founderId)
  if ("error" in scoped) return scoped.error

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }

  if (body.setPrimary === true) {
    const founders = await setPrimaryFounder(dealId, founderId)
    return NextResponse.json({ founders })
  }

  const updated = await updateFounder(founderId, {
    name: body.name,
    role: body.role,
    email: body.email,
    linkedinUrl: body.linkedinUrl,
    bio: body.bio,
    ownershipPct: body.ownershipPct != null ? Number(body.ownershipPct) : body.ownershipPct,
  })
  return NextResponse.json({ founder: updated, founders: await listFounders(dealId) })
}

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; dealId: string; founderId: string }> },
) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, dealId, founderId } = await ctx.params
  const scoped = await loadScoped(id, dealId, founderId)
  if ("error" in scoped) return scoped.error
  await deleteFounder(founderId)
  return NextResponse.json({ ok: true, founders: await listFounders(dealId) })
}
