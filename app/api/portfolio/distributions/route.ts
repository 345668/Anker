import { NextRequest, NextResponse } from "next/server"
import { requirePortfolioAccess } from "@/lib/auth/portfolio-access"
import { sql } from "@/lib/db"
import { createDistribution } from "@/lib/portfolio/distributions"
import { recordChange, snapshotRow } from "@/lib/audit/record-change"

export const runtime = "nodejs"

/**
 * POST — initiate a distribution (return of capital / realized gain / dividend).
 * Body: { title, source?, distType, grossAmount, mgmtFee, carry, paymentDate?, status }
 * createDistribution allocates per-LP pro-rata by ownership_pct.
 */
export async function POST(req: NextRequest) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  const userId = guard.id

  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const title = String(body?.title ?? "").trim()
  if (!title) return NextResponse.json({ error: "title required" }, { status: 400 })

  const fund = guard.fund

  const gross = Number(body?.grossAmount) || 0
  const mgmt = Number(body?.mgmtFee) || 0
  const carry = Number(body?.carry) || 0
  const status = body?.status === "notified" ? "notified" : "draft"

  const { distribution } = await createDistribution({
    fundId: fund.id,
    title,
    source: body?.source ?? body?.distType ?? null,
    grossAmount: gross || null,
    mgmtFeeDeduction: mgmt,
    carryDeduction: carry,
    paymentDate: body?.paymentDate ?? null,
    createdBy: userId,
  })

  if (status !== "draft") {
    // Notifying LPs is done here in direct SQL rather than through the audited
    // updateDistribution, so it is recorded here: it is the moment LPs are told.
    const notifiedFrom = await snapshotRow("distributions", distribution.id)
    await sql`UPDATE distributions SET status = ${status}, notified_at = NOW(), updated_at = NOW() WHERE id = ${distribution.id}`
    // Deliver in-app: mark funded lines 'notified' so LPs see the notice.
    await sql`
      UPDATE distribution_line_items
      SET status = 'notified', updated_at = NOW()
      WHERE distribution_id = ${distribution.id} AND amount > 0 AND status = 'pending'
    `
    await recordChange({
      actor: { userId },
      scope: { type: "fund", id: fund.id },
      action: "distribution.notified",
      target: { type: "distribution", id: distribution.id, label: title },
      before: notifiedFrom, after: await snapshotRow("distributions", distribution.id),
      context: {
        lineItems: await sql`SELECT id, fund_lp_id, amount, status FROM distribution_line_items WHERE distribution_id = ${distribution.id}`,
      },
    })
  }

  return NextResponse.json({ ok: true, distributionId: distribution.id })
}
