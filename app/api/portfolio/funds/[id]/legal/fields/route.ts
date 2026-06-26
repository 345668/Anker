/**
 * GET   /api/portfolio/funds/[id]/legal/fields
 * PATCH /api/portfolio/funds/[id]/legal/fields
 *
 * PATCH body: { values: { field_key: value, ... } }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { getLegalFields, patchLegalFields } from "@/lib/portfolio/legal-fields"

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
    const payload = await getLegalFields(fundId)
    if (!payload) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
    return NextResponse.json(payload)
  } catch (e: any) {
    console.error("[legal-fields GET]", e)
    return NextResponse.json({ error: e?.message ?? "Read failed" }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    const values = body?.values
    if (!values || typeof values !== "object" || Array.isArray(values)) {
      return NextResponse.json({ error: "Body must be { values: { ... } }" }, { status: 400 })
    }
    const payload = await patchLegalFields(fundId, values)
    return NextResponse.json(payload)
  } catch (e: any) {
    console.error("[legal-fields PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}
