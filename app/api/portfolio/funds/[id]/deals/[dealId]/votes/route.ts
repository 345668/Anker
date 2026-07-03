/**
 * POST /api/portfolio/funds/[id]/deals/[dealId]/votes
 *   Body: { member, vote, conditions?, note? }
 * One vote per member per deal (re-voting overwrites). Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  getDealById, castVote, tallyVotes, type IcVoteValue,
} from "@/lib/portfolio/deal-pipeline"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VOTES: IcVoteValue[] = ["approve", "approve_with_conditions", "decline", "abstain"]

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const fund = UUID_RE.test(trimmed)
    ? (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
    : await getFundBySlug(trimmed)
  return fund?.id ?? null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string; dealId: string }> }) {
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
    const member = typeof body?.member === "string" && body.member.trim()
      ? body.member.trim()
      : (admin.email ?? admin.id ?? "unknown")
    if (!VOTES.includes(body?.vote)) {
      return NextResponse.json({ error: `vote must be one of ${VOTES.join(", ")}` }, { status: 400 })
    }
    const votes = await castVote(
      dealId, member, body.vote,
      typeof body.conditions === "string" ? body.conditions : null,
      typeof body.note === "string" ? body.note : null,
    )
    const tally = await tallyVotes(dealId)
    return NextResponse.json({ votes, tally })
  } catch (e: any) {
    console.error("[deal votes POST]", e)
    return NextResponse.json({ error: e?.message ?? "Vote failed" }, { status: 500 })
  }
}
