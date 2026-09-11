/**
 * Compliance deadline instances.
 *   POST  { fundId?, year }                          generate the year's deadlines
 *   PATCH { fundId?, deadlineId, status?, filed_date?, filing_reference?, notes? }
 *
 * Active fund workspace owner/admin only. Feature adapted from Hemrock Portfolio Reporting (Apache-2.0).
 */
import { NextRequest, NextResponse } from "next/server"
import { requirePortfolioAccess } from "@/lib/auth/portfolio-access"
import { generateDeadlines, updateDeadline, DEADLINE_STATUSES, type DeadlineStatus } from "@/lib/portfolio/compliance"

export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  let body: any = {}
  try { body = await req.json() } catch {}
  const fundId = guard.fund.id
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const year = Number(body?.year) || new Date().getUTCFullYear()
  const created = await generateDeadlines(fundId, year)
  return NextResponse.json({ ok: true, created, year })
}

export async function PATCH(req: NextRequest) {
  const guard = await requirePortfolioAccess(req)
  if (guard instanceof NextResponse) return guard
  let body: any = {}
  try { body = await req.json() } catch {}
  const deadlineId = typeof body?.deadlineId === "string" ? body.deadlineId : ""
  if (!deadlineId) return NextResponse.json({ error: "deadlineId required" }, { status: 400 })
  const fundId = guard.fund.id
  if (!fundId) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
  const status: DeadlineStatus | undefined =
    DEADLINE_STATUSES.includes(body.status) ? body.status : undefined

  const updated = await updateDeadline(fundId, deadlineId, {
    status,
    filed_date: typeof body.filed_date === "string" ? body.filed_date : null,
    filing_reference: typeof body.filing_reference === "string" ? body.filing_reference.slice(0, 500) : null,
    notes: typeof body.notes === "string" ? body.notes.slice(0, 2000) : null,
  })
  if (!updated) return NextResponse.json({ error: "Deadline not found" }, { status: 404 })
  return NextResponse.json({ ok: true })
}
