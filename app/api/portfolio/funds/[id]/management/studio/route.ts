/**
 * POST /api/portfolio/funds/[id]/management/studio
 *   Body: { name, oneLiner?, sector?, leadEir?, budgetAmount?, startedAt?, notes? }
 * Creates a studio project (stage: idea). Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { createProject, hasMcTables } from "@/lib/portfolio/management-company"

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
  if (!(await hasMcTables())) {
    return NextResponse.json(
      { error: "management tables missing — run scripts/oneshot/run-management-company-tables.mjs first." },
      { status: 503 },
    )
  }
  try {
    const body = await req.json()
    if (!body?.name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 })
    }
    const project = await createProject({
      fundId,
      name: body.name,
      oneLiner: body.oneLiner ?? null,
      sector: body.sector ?? null,
      leadEir: body.leadEir ?? null,
      budgetAmount: body.budgetAmount != null ? Number(body.budgetAmount) : null,
      startedAt: body.startedAt ?? null,
      notes: body.notes ?? null,
      createdBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json(project, { status: 201 })
  } catch (e: any) {
    console.error("[studio POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}
