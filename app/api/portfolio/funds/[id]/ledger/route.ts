/**
 * GET /api/portfolio/funds/[id]/ledger
 *   → { entries, statements }  — journal + trial balance + P&L + BS,
 *     all folded from journal_lines. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { listEntries, buildStatements, hasLedgerTables } from "@/lib/portfolio/fund-ledger"

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
  if (!(await hasLedgerTables())) {
    return NextResponse.json(
      { error: "journal tables missing — run scripts/oneshot/run-fund-ledger-tables.mjs first." },
      { status: 503 },
    )
  }
  try {
    const [entries, statements] = await Promise.all([
      listEntries(fundId), buildStatements(fundId),
    ])
    return NextResponse.json({ entries, statements })
  } catch (e: any) {
    console.error("[ledger GET]", e)
    return NextResponse.json({ error: e?.message ?? "Read failed" }, { status: 500 })
  }
}
