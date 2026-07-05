/**
 * POST /api/portfolio/funds/[id]/syndicates/[synId]/events
 *   Body: { partnerId, stage, amount?, note? }
 *   Appends a commitment event on the SPV. `invited` accepts
 *   partnerIds[] for bulk invites. `funded` auto-promotes the partner
 *   to a real LP row on the SPV. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getSyndicateById, recordCommitmentEvent, getSpvFunnel,
  COMMITMENT_STAGES, type CommitmentStage,
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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; synId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id, synId } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const syndicate = await getSyndicateById(synId)
  if (!syndicate || syndicate.lead_fund_id !== fundId) {
    return NextResponse.json({ error: "Syndicate not found" }, { status: 404 })
  }
  try {
    const body = await req.json()
    const stage = body?.stage as CommitmentStage
    if (!COMMITMENT_STAGES.includes(stage)) {
      return NextResponse.json({ error: `stage must be one of ${COMMITMENT_STAGES.join(", ")}` }, { status: 400 })
    }
    const partnerIds: string[] = Array.isArray(body?.partnerIds)
      ? body.partnerIds.filter((p: any) => typeof p === "string")
      : typeof body?.partnerId === "string" ? [body.partnerId] : []
    if (partnerIds.length === 0) {
      return NextResponse.json({ error: "partnerId (or partnerIds[]) required" }, { status: 400 })
    }
    for (const partnerId of partnerIds) {
      await recordCommitmentEvent({
        fundId: syndicate.spv_fund_id,
        partnerId,
        stage,
        amount: body.amount != null ? Number(body.amount) : null,
        note: body.note ?? null,
        createdBy: admin.email ?? admin.id ?? null,
      })
    }
    const funnel = await getSpvFunnel(synId)
    return NextResponse.json({ funnel }, { status: 201 })
  } catch (e: any) {
    console.error("[syndicate events POST]", e)
    return NextResponse.json({ error: e?.message ?? "Event failed" }, { status: 500 })
  }
}
