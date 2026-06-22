/**
 * GET   /api/portfolio/funds/[id]/assessment
 * PATCH /api/portfolio/funds/[id]/assessment   — partial update of jsonb values
 *
 * The PATCH body is `{ values: { field_key: value, ... } }`. The storage
 * layer (lib/portfolio/fund-assessment.ts) handles merging, sanitisation,
 * computed-field stripping, and re-derivation on response.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getAssessment, patchAssessment } from "@/lib/portfolio/fund-assessment"
import {
  getLatestSnapshot, snapshotIfChanged, computeDelta, recommendNextFields,
} from "@/lib/portfolio/fund-assessment-history"
import { getAssessmentMeta } from "@/lib/portfolio/fund-assessment-generation"

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
    const result = await getAssessment(fundId)
    // Layer phase-2 + phase-3 data on top of the base assessment payload.
    // delta, recommendations, and meta are cheap to compute; the client
    // gets everything it needs in one round trip.
    const prior = await getLatestSnapshot(fundId)
    const delta = computeDelta(result.completion, prior)
    const recommendations = recommendNextFields(result.values, 5)
    const meta = await getAssessmentMeta(fundId)
    return NextResponse.json({ ...result, delta, recommendations, meta })
  } catch (e: any) {
    console.error("[fund-assessment GET]", e)
    return NextResponse.json({ error: e?.message ?? "Read failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    const values = body?.values
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return NextResponse.json(
        { error: "Body must be { values: { ... } }" },
        { status: 400 },
      )
    }
    // Capture the delta BEFORE writing — the latest snapshot is the
    // baseline we compare against. After patch+snapshot, the freshest
    // snapshot becomes the new baseline.
    const priorSnap = await getLatestSnapshot(fundId)
    const result = await patchAssessment(fundId, values)
    // Snapshot is rate-limited inside the helper — debounced 15 min OR a
    // 5+ point swing. Audit trail for who triggered the change.
    await snapshotIfChanged(fundId, result.completion, admin.email ?? admin.id ?? null)
    const delta = computeDelta(result.completion, priorSnap)
    const recommendations = recommendNextFields(result.values, 5)
    const meta = await getAssessmentMeta(fundId)
    return NextResponse.json({ ...result, delta, recommendations, meta })
  } catch (e: any) {
    console.error("[fund-assessment PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}
