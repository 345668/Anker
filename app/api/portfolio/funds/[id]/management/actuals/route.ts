/**
 * POST   /api/portfolio/funds/[id]/management/actuals
 *   Body: { occurredOn, category, amount, memo? }
 * DELETE /api/portfolio/funds/[id]/management/actuals?actualId=…
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { addActual, deleteActual } from "@/lib/portfolio/management-company"

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    if (typeof body?.occurredOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.occurredOn)) {
      return NextResponse.json({ error: "occurredOn (YYYY-MM-DD) required" }, { status: 400 })
    }
    if (typeof body?.category !== "string" || !body.category.trim()) {
      return NextResponse.json({ error: "category required" }, { status: 400 })
    }
    const amount = Number(body?.amount)
    if (!Number.isFinite(amount)) {
      return NextResponse.json({ error: "amount must be a number" }, { status: 400 })
    }
    await addActual({
      fundId,
      occurredOn: body.occurredOn,
      category: body.category.trim(),
      amount,
      memo: body.memo ?? null,
      createdBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (e: any) {
    console.error("[management actuals POST]", e)
    return NextResponse.json({ error: e?.message ?? "Save failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const actualId = new URL(req.url).searchParams.get("actualId")
  if (!actualId) return NextResponse.json({ error: "actualId required" }, { status: 400 })
  const ok = await deleteActual(actualId, fundId)
  if (!ok) return NextResponse.json({ error: "Actual not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
