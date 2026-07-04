/**
 * GET   /api/portfolio/funds/[id]/syndicates/[synId]  → { funnel }
 * PATCH /api/portfolio/funds/[id]/syndicates/[synId]  → { status }
 * Admin-gated. [id] is the LEAD fund.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getSyndicateById, getSpvFunnel, updateSyndicateStatus,
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

async function loadScoped(id: string, synId: string) {
  const fundId = await resolveFundId(id)
  if (!fundId) return { error: NextResponse.json({ error: "Fund not found" }, { status: 404 }) }
  const syndicate = await getSyndicateById(synId)
  if (!syndicate || syndicate.lead_fund_id !== fundId) {
    return { error: NextResponse.json({ error: "Syndicate not found" }, { status: 404 }) }
  }
  return { fundId, syndicate }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string; synId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, synId } = await ctx.params
  const scoped = await loadScoped(id, synId)
  if ("error" in scoped) return scoped.error
  const funnel = await getSpvFunnel(synId)
  return NextResponse.json({ funnel })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; synId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, synId } = await ctx.params
  const scoped = await loadScoped(id, synId)
  if ("error" in scoped) return scoped.error
  try {
    const body = await req.json()
    if (!["raising", "closing", "closed", "cancelled"].includes(body?.status)) {
      return NextResponse.json({ error: "status must be raising|closing|closed|cancelled" }, { status: 400 })
    }
    const syndicate = await updateSyndicateStatus(synId, body.status)
    return NextResponse.json(syndicate)
  } catch (e: any) {
    console.error("[syndicate PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}
