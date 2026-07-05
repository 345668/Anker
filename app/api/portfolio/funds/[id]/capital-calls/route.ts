/**
 * GET  /api/portfolio/funds/[id]/capital-calls
 * POST /api/portfolio/funds/[id]/capital-calls
 *   Body: { title, purpose?, defaultCallPct?, dueDate? }
 *   Creates the call + a line item per non-transferred LP, pro-rated
 *   against commitment_amount × defaultCallPct.
 *
 * Admin-gated. [id] accepts either UUID or slug.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { listCalls, createCall } from "@/lib/portfolio/capital-calls"

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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const rows = await listCalls(fundId)
  return NextResponse.json({ rows, total: rows.length })
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
    if (!body?.title?.trim()) {
      return NextResponse.json({ error: "title required" }, { status: 400 })
    }
    const result = await createCall({
      fundId,
      title: String(body.title),
      purpose: body.purpose ?? null,
      defaultCallPct: numOrNull(body.defaultCallPct),
      dueDate: body.dueDate ?? null,
      createdBy: admin.email ?? admin.id,
    })
    return NextResponse.json(result, { status: 201 })
  } catch (e: any) {
    console.error("[capital-calls POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}

function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
