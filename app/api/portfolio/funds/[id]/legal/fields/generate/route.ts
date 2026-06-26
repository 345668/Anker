/**
 * POST /api/portfolio/funds/[id]/legal/fields/generate
 *
 * Body: { fieldKeys: string[], regenerate?: boolean }
 *
 * Generates AI text for the requested 'generated'-type legal fields,
 * persists text + confidence + provenance, and returns:
 *   { results, values, completion, meta, approvals }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalFields } from "@/lib/portfolio/legal-fields"
import {
  generateLegalFields, getLegalFieldsMeta,
} from "@/lib/portfolio/legal-fields-generation"

export const runtime = "nodejs"
export const maxDuration = 300

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
      return NextResponse.json({ error: "Body must include fieldKeys: string[]" }, { status: 400 })
    }
    const regenerate = body?.regenerate !== false
    const results = await generateLegalFields({
      fundId,
      fieldKeys,
      regenerate,
      generatedBy: admin.email ?? admin.id ?? null,
    })
    // Re-read so the payload reflects what's persisted (avoids drift).
    const payload = await getLegalFields(fundId)
    const meta = await getLegalFieldsMeta(fundId)
    return NextResponse.json({ ...payload, meta, results })
  } catch (e: any) {
    console.error("[legal-fields generate POST]", e)
    return NextResponse.json({ error: e?.message ?? "Generation failed" }, { status: 500 })
  }
}
