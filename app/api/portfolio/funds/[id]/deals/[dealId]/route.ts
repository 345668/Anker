/**
 * GET    /api/portfolio/funds/[id]/deals/[dealId]  → deal + evaluation + votes + terms
 * PATCH  /api/portfolio/funds/[id]/deals/[dealId]
 *   Body: field patch, and/or { stage, passedReason? } for a transition.
 * DELETE /api/portfolio/funds/[id]/deals/[dealId]
 *
 * Admin-gated. Verifies the deal belongs to the resolved fund.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getDealById, updateDeal, transitionDeal, deleteDeal, getEvaluation,
  listVotes, tallyVotes, listTermGrids, DealTransitionError,
  DEAL_STAGES, type DealStage,
} from "@/lib/portfolio/deal-pipeline"

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
  const [evaluation, votes, tally, terms] = await Promise.all([
    getEvaluation(dealId), listVotes(dealId), tallyVotes(dealId), listTermGrids(dealId),
  ])
  return NextResponse.json({ deal: scoped.deal, evaluation, votes, tally, terms })
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id, dealId } = await ctx.params
  const scoped = await loadScoped(id, dealId)
  if ("error" in scoped) return scoped.error
  try {
    const body = await req.json()

    // Field patch first (a transition can ride along in the same call).
    const hasFieldPatch = ["companyName", "website", "oneLiner", "sector", "geography",
      "roundName", "raiseAmount", "preMoney", "proposedCheck", "source", "ownerEmail", "notes",
    ].some((k) => body[k] !== undefined)
    let deal = scoped.deal
    if (hasFieldPatch) {
      deal = (await updateDeal(dealId, body)) ?? deal
    }

    if (body.stage !== undefined) {
      if (!DEAL_STAGES.includes(body.stage)) {
        return NextResponse.json({ error: `Unknown stage: ${body.stage}` }, { status: 400 })
      }
      deal = await transitionDeal(
        dealId, body.stage as DealStage,
        admin.email ?? admin.id ?? null,
        body.passedReason ?? null,
      )
    }
    return NextResponse.json(deal)
  } catch (e: any) {
    if (e instanceof DealTransitionError) {
      const status = e.code === "invalid_transition" || e.code === "use_close" ? 409
        : e.code === "no_votes" || e.code === "vote_failed" ? 422
        : 400
      return NextResponse.json({ error: e.message, code: e.code }, { status })
    }
    console.error("[deal PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id, dealId } = await ctx.params
  const scoped = await loadScoped(id, dealId)
  if ("error" in scoped) return scoped.error
  if (scoped.deal.stage === "closed") {
    return NextResponse.json(
      { error: "Closed deals are fund-of-record history — they can't be deleted." },
      { status: 409 },
    )
  }
  await deleteDeal(dealId)
  return NextResponse.json({ ok: true })
}
