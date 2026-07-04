/**
 * POST   /api/portfolio/funds/[id]/ledger/entries
 *   Body: { entryDate, memo, lines: [{ accountCode, debit?, credit? }] }
 *   Posts a MANUAL journal entry (double-entry validated).
 * DELETE /api/portfolio/funds/[id]/ledger/entries?entryId=…
 *   Deletes a manual entry (auto entries are projection-owned).
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getFundById, getFundBySlug } from "@/lib/portfolio/funds"
import { postEntry, deleteEntry, LedgerError } from "@/lib/portfolio/fund-ledger"

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
    const entryDate = typeof body?.entryDate === "string" ? body.entryDate : null
    if (!entryDate || !/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) {
      return NextResponse.json({ error: "entryDate (YYYY-MM-DD) required" }, { status: 400 })
    }
    if (!body?.memo?.trim()) {
      return NextResponse.json({ error: "memo required" }, { status: 400 })
    }
    if (!Array.isArray(body?.lines)) {
      return NextResponse.json({ error: "lines[] required" }, { status: 400 })
    }
    const entryId = await postEntry({
      fundId,
      entryDate,
      memo: body.memo.trim(),
      lines: body.lines,
      sourceKind: "manual",
      createdBy: admin.email ?? admin.id ?? null,
    })
    return NextResponse.json({ id: entryId }, { status: 201 })
  } catch (e: any) {
    if (e instanceof LedgerError) {
      return NextResponse.json({ error: e.message, code: e.code }, { status: 422 })
    }
    console.error("[ledger entries POST]", e)
    return NextResponse.json({ error: e?.message ?? "Post failed" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id } = await ctx.params
  const fundId = await resolveFundId(id)
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const entryId = new URL(req.url).searchParams.get("entryId")
  if (!entryId) return NextResponse.json({ error: "entryId required" }, { status: 400 })
  try {
    const ok = await deleteEntry(entryId)
    if (!ok) {
      return NextResponse.json(
        { error: "Entry not found or not manual — auto entries are owned by the rebuild projection." },
        { status: 409 },
      )
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[ledger entries DELETE]", e)
    return NextResponse.json({ error: e?.message ?? "Delete failed" }, { status: 500 })
  }
}
