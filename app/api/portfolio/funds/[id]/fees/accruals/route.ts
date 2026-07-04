/**
 * POST  /api/portfolio/funds/[id]/fees/accruals   → generate quarterly accruals
 * PATCH /api/portfolio/funds/[id]/fees/accruals   → { accrualId, status }
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import {
  generateAccruals, setAccrualStatus, listAccruals,
} from "@/lib/portfolio/fund-fees"

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

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const result = await generateAccruals(fundId)
    const accruals = await listAccruals(fundId)
    return NextResponse.json({ result, accruals })
  } catch (e: any) {
    console.error("[fee accruals POST]", e)
    return NextResponse.json({ error: e?.message ?? "Generate failed" }, { status: 500 })
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
    if (!body?.accrualId || !["accrued", "paid", "waived"].includes(body?.status)) {
      return NextResponse.json({ error: "Body must be { accrualId, status: accrued|paid|waived }" }, { status: 400 })
    }
    const accrual = await setAccrualStatus(body.accrualId, body.status)
    if (!accrual || accrual.fund_id !== fundId) {
      return NextResponse.json({ error: "Accrual not found" }, { status: 404 })
    }
    return NextResponse.json(accrual)
  } catch (e: any) {
    console.error("[fee accruals PATCH]", e)
    return NextResponse.json({ error: e?.message ?? "Update failed" }, { status: 500 })
  }
}
