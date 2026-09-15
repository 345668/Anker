import { requireFundAccess } from "@/lib/auth/fund-access"
/**
 * GET /api/portfolio/funds/[id]/ledger
 *   → { entries, statements }  — journal + trial balance + P&L + BS,
 *     all folded from journal_lines. Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { listEntries, buildStatements, hasLedgerTables, rebuildJournal } from "@/lib/portfolio/fund-ledger"

export const runtime = "nodejs"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function resolveFundId(slugOrId: string): Promise<string | null> {
  const trimmed = slugOrId.trim()
  if (!trimmed) return null
  const fund = UUID_RE.test(trimmed)
    ? (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
    : (await getFundById(trimmed)) ?? (await getFundBySlug(trimmed))
  return fund?.id ?? null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireFundAccess((await ctx.params).id)
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
    let entries = await listEntries(fundId)

    // First-materialization: the journal is an idempotent, event-sourced
    // projection, but it only ever built on an explicit admin click — so a fund
    // with real investments, calls and distributions still rendered a blank
    // ledger and empty statements until someone knew to press "Rebuild".
    // Derive it on first read instead. Guarded to the empty case, so this can
    // never clobber existing entries (manual ones included); a genuinely empty
    // fund just re-derives nothing. Explicit rebuilds still go through POST.
    if (entries.length === 0) {
      try {
        const built = await rebuildJournal(fundId, "auto:first-read")
        if (built.entriesCreated > 0) {
          console.info(`[ledger GET] materialized ${built.entriesCreated} entries for fund ${fundId}`)
          entries = await listEntries(fundId)
        }
      } catch (e: any) {
        // A failed auto-build must never break the read — fall through and
        // return the (empty) ledger so the UI can still offer Rebuild.
        console.error("[ledger GET] first-read materialization failed:", e?.message)
      }
    }

    const statements = await buildStatements(fundId)
    return NextResponse.json({ entries, statements })
  } catch (e: any) {
    console.error("[ledger GET]", e)
    return NextResponse.json({ error: e?.message ?? "Read failed" }, { status: 500 })
  }
}
