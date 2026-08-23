/**
 * POST /api/portfolio/funds/[id]/k1/generate
 *
 * Generate per-LP Schedule K-1 (informational) documents for a tax year and file each
 * into the LP's data room as a `k1`-category doc — which the Fund Tax page reads to show
 * "K-1s issued". The K-1 engine (lib/portfolio/k1) computes every figure; the model
 * writes nothing.
 *
 * Body: { taxYear: number, fundIncome?: { ordinaryIncome, realizedGain, deductions },
 *         dryRun?: boolean }
 *   - fundIncome: GP override of the fund-level tax income (Part III). Omit to default
 *     from the fund ledger (flagged for confirmation).
 *   - dryRun: compute + return the per-LP lines without generating/filing documents.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { buildFundK1s, k1ToMarkdown, type FundTaxIncome } from "@/lib/portfolio/k1"
import { markdownToDocxBuffer } from "@/lib/ai/docx-export"
import { createDocument } from "@/lib/portfolio/data-room"

export const runtime = "nodejs"
export const maxDuration = 240

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  const { id: fundId } = await ctx.params

  const body = await req.json().catch(() => ({})) as { taxYear?: number; fundIncome?: Partial<FundTaxIncome>; dryRun?: boolean }
  const taxYear = Number(body.taxYear)
  if (!Number.isInteger(taxYear) || taxYear < 2000 || taxYear > 2100) {
    return NextResponse.json({ error: "Provide a valid 'taxYear' (e.g. 2025)." }, { status: 400 })
  }

  const batch = await buildFundK1s(fundId, taxYear, { fundIncome: body.fundIncome })
  if (!batch) return NextResponse.json({ error: "Fund not found." }, { status: 404 })
  if (!batch.lines.length) return NextResponse.json({ error: "No active LPs to issue K-1s for." }, { status: 409 })

  if (body.dryRun) {
    return NextResponse.json({ ok: true, dryRun: true, taxYear, fundIncome: batch.fundIncome, fromLedger: batch.fromLedger, lines: batch.lines })
  }

  let generated = 0
  const skipped: { lpName: string; reason: string }[] = []
  for (const line of batch.lines) {
    try {
      const md = k1ToMarkdown(batch, line)
      // Title only — the markdown carries the K-1 heading, tax year, and basis note.
      // (Picks up the Anker house style automatically wherever doc-theme is present.)
      const buf = await markdownToDocxBuffer(md, `K-1 ${taxYear} — ${line.lpName}`)
      const { put } = await import("@vercel/blob")
      const blob = await put(
        `data-room/${fundId}/k1-${taxYear}-${line.lpId}.docx`,
        Buffer.from(buf),
        { access: "private" as any, token: process.env.BLOB_READ_WRITE_TOKEN, contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", addRandomSuffix: true },
      )
      await createDocument({
        fundId,
        fundLpId: line.lpId,
        category: "k1",
        title: `Schedule K-1 (${taxYear}) — ${line.lpName}`,
        description: batch.fromLedger ? "Informational K-1 — fund income defaulted from ledger; confirm before filing." : "Informational K-1.",
        fileUrl: blob.url,
        fileName: `K-1-${taxYear}-${line.lpName.replace(/[^a-z0-9]+/gi, "-")}.docx`,
        contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        byteSize: buf.length,
        uploadedBy: guard.email ?? null,
      })
      generated++
    } catch (e: any) {
      skipped.push({ lpName: line.lpName, reason: e?.message ?? "generation failed" })
    }
  }

  return NextResponse.json({
    ok: true, taxYear, generated, skipped,
    fundIncome: batch.fundIncome, fromLedger: batch.fromLedger,
    note: batch.incomeBasisNote,
  })
}
