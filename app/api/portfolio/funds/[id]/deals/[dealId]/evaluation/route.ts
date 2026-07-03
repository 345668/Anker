/**
 * PUT /api/portfolio/funds/[id]/deals/[dealId]/evaluation
 *   Body: { scores: { criterion: { score: 1-5, note? } }, summary? }
 * Upserts the deal's weighted scorecard. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getDealById, upsertEvaluation, DEAL_CRITERIA, type ScoreMap,
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

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id, dealId } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const deal = await getDealById(dealId)
  if (!deal || deal.fund_id !== fundId) {
    return NextResponse.json({ error: "Deal not found" }, { status: 404 })
  }
  try {
    const body = await req.json()
    const raw = body?.scores
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return NextResponse.json({ error: "Body must include { scores: { … } }" }, { status: 400 })
    }
    // Whitelist criteria + clamp scores — junk keys are dropped silently.
    const valid = new Set(DEAL_CRITERIA.map((c) => c.key))
    const scores: ScoreMap = {}
    for (const [k, v] of Object.entries(raw as Record<string, any>)) {
      if (!valid.has(k)) continue
      const score = Number(v?.score)
      if (!Number.isFinite(score)) continue
      scores[k] = {
        score: Math.min(5, Math.max(1, score)),
        note: typeof v?.note === "string" ? v.note : null,
      }
    }
    const evaluation = await upsertEvaluation(
      dealId, scores,
      typeof body.summary === "string" ? body.summary : null,
      admin.email ?? admin.id ?? null,
    )
    return NextResponse.json(evaluation)
  } catch (e: any) {
    console.error("[deal evaluation PUT]", e)
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 })
  }
}
