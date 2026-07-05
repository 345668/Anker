/**
 * POST /api/portfolio/funds/[id]/ledger/rebuild
 *   Re-derives every auto journal entry from the record (paid call lines,
 *   investments, valuation snapshots, exits, paid distribution lines).
 *   Manual entries survive. Idempotent. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { rebuildJournal, buildStatements, LedgerError } from "@/lib/portfolio/fund-ledger"

export const runtime = "nodejs"
export const maxDuration = 120

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
  const admin = guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  try {
    const result = await rebuildJournal(fundId, admin.email ?? admin.id ?? null)
    const statements = await buildStatements(fundId)
    return NextResponse.json({ result, statements })
  } catch (e: any) {
    if (e instanceof LedgerError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 503 })
    }
    console.error("[ledger rebuild POST]", e)
    return NextResponse.json({ error: e?.message ?? "Rebuild failed" }, { status: 500 })
  }
}
