/**
 * GET  /api/portfolio/funds/[id]/legal/review
 * POST /api/portfolio/funds/[id]/legal/review   { reviewerEmail? } → submit
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getReviewState, submitForReview, LegalSubmitError } from "@/lib/portfolio/legal-reviews"

export const runtime = "nodejs"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const fund = UUID_RE.test(slugOrId.trim())
    ? (await getFundById(slugOrId)) ?? (await getFundBySlug(slugOrId))
    : await getFundBySlug(slugOrId)
  return fund?.id ?? null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const state = await getReviewState(fundId)
    return NextResponse.json(state)
  } catch (e: any) {
    console.error("[legal-review GET]", e)
    return NextResponse.json({ error: e?.message ?? "Read failed" }, { status: 500 })
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json().catch(() => ({}))
    const state = await submitForReview({
      fundId,
      submittedBy: admin.email ?? admin.id ?? null,
      reviewerEmail: typeof body?.reviewerEmail === "string" ? body.reviewerEmail : null,
    })
    return NextResponse.json(state)
  } catch (e: any) {
    if (e instanceof LegalSubmitError) {
      // Map known submit errors to client-friendly status codes so the
      // editor can render the right inline banner without parsing
      // error strings.
      const status = e.code === "blocking_fields" || e.code === "no_credits" ? 422
        : e.code === "already_in_review" ? 409
        : e.code === "schema_missing" ? 503
        : 400
      return NextResponse.json({ error: e.message, code: e.code }, { status })
    }
    console.error("[legal-review POST]", e)
    return NextResponse.json({ error: e?.message ?? "Submit failed" }, { status: 500 })
  }
}
