/**
 * POST /api/portfolio/funds/[id]/assessment/generate
 *
 * Body: { fieldKeys: string[], regenerate?: boolean }
 *
 * Generates AI text for each requested 'generated' field, computes a
 * confidence score (0-1), persists text + meta, and returns:
 *   {
 *     results: [{ fieldKey, text, meta, error? }, ...],
 *     values:  { updated assessment values map },
 *     completion: { updated Strength + completion },
 *     meta:    { fieldKey: { confidence, generated_at, ... } }
 *   }
 *
 * Admin-gated. Sequential per-field generation — see comments in
 * lib/portfolio/fund-assessment-generation.ts for the pacing rationale.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getAssessment } from "@/lib/portfolio/fund-assessment"
import {
  generateFields, getAssessmentMeta,
} from "@/lib/portfolio/fund-assessment-generation"

export const runtime = "nodejs"
export const maxDuration = 300  // 5 min — bulk generation of many narratives

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
    const fieldKeys: string[] = Array.isArray(body?.fieldKeys)
      ? body.fieldKeys.filter((k: any) => typeof k === "string")
      : []
    if (fieldKeys.length === 0) {
      return NextResponse.json(
        { error: "Body must include fieldKeys: string[]" },
        { status: 400 },
      )
    }
    const regenerate = body?.regenerate !== false  // default true
    const results = await generateFields({
      fundId,
      fieldKeys,
      regenerate,
      generatedBy: admin.email ?? admin.id ?? null,
    })
    // Re-read so the response reflects what's now persisted on the row
    // (avoids drift between in-memory snapshot and DB).
    const assessment = await getAssessment(fundId)
    const meta = await getAssessmentMeta(fundId)
    return NextResponse.json({
      results,
      values: assessment.values,
      completion: assessment.completion,
      meta,
    })
  } catch (e: any) {
    console.error("[fund-assessment generate POST]", e)
    return NextResponse.json(
      { error: e?.message ?? "Generation failed" },
      { status: 500 },
    )
  }
}
