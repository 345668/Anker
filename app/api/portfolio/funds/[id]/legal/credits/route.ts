/**
 * POST /api/portfolio/funds/[id]/legal/credits   { amount, reason?, memo? }
 *
 * Mock purchase endpoint — phase-5 doesn't wire Stripe yet. Admin-gated
 * so the dev team can hand out credits to test the submit flow. Phase
 * 5+ swaps this for a real billing integration.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { grantCredits, getReviewState, LegalSubmitError } from "@/lib/portfolio/legal-reviews"

export const runtime = "nodejs"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const fund = UUID_RE.test(slugOrId.trim())
    ? (await getFundById(slugOrId)) ?? (await getFundBySlug(slugOrId))
    : await getFundBySlug(slugOrId)
  return fund?.id ?? null
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    const amount = Number(body?.amount ?? 0)
    if (!Number.isInteger(amount) || amount === 0 || Math.abs(amount) > 100) {
      return NextResponse.json({ error: "amount must be an integer in [-100, 100]" }, { status: 400 })
    }
    const reason = ["purchase", "grant", "refund", "adjustment"].includes(body?.reason)
      ? body.reason as "purchase" | "grant" | "refund" | "adjustment"
      : "grant"
    await grantCredits({
      fundId,
      amount,
      reason,
      memo: typeof body?.memo === "string" ? body.memo : null,
      createdBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json(await getReviewState(fundId))
  } catch (e: any) {
    if (e instanceof LegalSubmitError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: e.code === "schema_missing" ? 503 : 400 })
    }
    console.error("[legal-credits POST]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}
