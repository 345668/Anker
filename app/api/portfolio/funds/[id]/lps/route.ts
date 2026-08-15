/**
 * GET  /api/portfolio/funds/[id]/lps          — list LPs on a fund
 * POST /api/portfolio/funds/[id]/lps          — add an LP
 *
 * The [id] segment accepts a UUID or a slug.  We resolve it server-side.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  getFundById, getFundBySlug,
  listLps, createLp,
  LP_TYPES, LP_STATUSES, SUBSCRIPTION_STATUSES, type LpType, type LpStatus, type SubscriptionStatus,
} from "@/lib/portfolio/funds"

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
  const rows = await listLps(fundId)
  return NextResponse.json({ rows, total: rows.length })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const body = await req.json()
    if (!body?.lpName?.trim()) {
      return NextResponse.json({ error: "lpName required" }, { status: 400 })
    }
    const lp = await createLp({
      fundId,
      lpName: String(body.lpName),
      lpType: parseLpType(body.lpType),
      lpContactId: body.lpContactId ?? null,
      commitmentAmount: numOrNull(body.commitmentAmount),
      calledAmount: numOrNull(body.calledAmount),
      distributedAmount: numOrNull(body.distributedAmount),
      signedAt: body.signedAt ?? null,
      status: parseLpStatus(body.status),
      subscriptionStatus: parseSubStatus(body.subscriptionStatus),
      notes: body.notes ?? null,
      metadata: body.metadata ?? {},
    })
    return NextResponse.json({ lp }, { status: 201 })
  } catch (e: any) {
    console.error("[fund_lps POST]", e)
    return NextResponse.json({ error: e?.message ?? "Create failed" }, { status: 500 })
  }
}

function parseLpType(s: any): LpType | null {
  if (typeof s === "string" && (LP_TYPES as readonly string[]).includes(s)) return s as LpType
  return null
}
function parseLpStatus(s: any): LpStatus {
  if (typeof s === "string" && (LP_STATUSES as readonly string[]).includes(s)) return s as LpStatus
  return "committed"
}
function parseSubStatus(s: any): SubscriptionStatus {
  if (typeof s === "string" && (SUBSCRIPTION_STATUSES as readonly string[]).includes(s)) return s as SubscriptionStatus
  return "prospective"
}
function numOrNull(v: any): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
