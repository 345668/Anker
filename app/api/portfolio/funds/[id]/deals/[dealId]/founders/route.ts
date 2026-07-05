/**
 * GET  /api/portfolio/funds/[id]/deals/[dealId]/founders  → founder list
 * POST /api/portfolio/funds/[id]/deals/[dealId]/founders  → create founder
 *   Body: { name, role?, email?, linkedinUrl?, bio?, ownershipPct?, isPrimary? }
 *
 * Admin-gated. Verifies the deal belongs to the resolved fund.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getDealById } from "@/lib/portfolio/deal-pipeline"
import { listFounders, createFounder } from "@/lib/portfolio/deal-founders"

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

async function loadScoped(id: string, dealId: string) {
  const fundId = await resolveFundId(id)
  if (!fundId) return { error: NextResponse.json({ error: "Fund not found" }, { status: 404 }) }
  const deal = await getDealById(dealId)
  if (!deal || deal.fund_id !== fundId) {
    return { error: NextResponse.json({ error: "Deal not found" }, { status: 404 }) }
  }
  return { fundId, deal }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, dealId } = await ctx.params
  const scoped = await loadScoped(id, dealId)
  if ("error" in scoped) return scoped.error
  return NextResponse.json({ founders: await listFounders(dealId) })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, dealId } = await ctx.params
  const scoped = await loadScoped(id, dealId)
  if ("error" in scoped) return scoped.error

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }) }
  if (!body?.name || !String(body.name).trim()) {
    return NextResponse.json({ error: "Founder name is required" }, { status: 400 })
  }
  const founder = await createFounder({
    dealId,
    name: String(body.name),
    role: body.role ?? null,
    email: body.email ?? null,
    linkedinUrl: body.linkedinUrl ?? null,
    bio: body.bio ?? null,
    ownershipPct: body.ownershipPct != null ? Number(body.ownershipPct) : null,
    isPrimary: body.isPrimary === true,
  })
  return NextResponse.json({ founder, founders: await listFounders(dealId) })
}
