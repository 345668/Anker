/**
 * GET  /api/admin/unit-economics -> this month's cost: totals, workspaces against their limits, cost per run by task, metered units, and the provider bills entered so far.
 * POST { month: "YYYY-MM", provider, amountUsd, note? } -> saves the provider's bill for a month (docs/architecture/58). Portal service principal only.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { BillError, economics, saveBill } from "@/lib/metering/economics"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

async function guard() {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  if (g.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  return g
}
export async function GET() {
  const g = await guard(); if (g instanceof NextResponse) return g
  return NextResponse.json(await economics())
}
export async function POST(req: NextRequest) {
  const g = await guard(); if (g instanceof NextResponse) return g
  const b = await req.json().catch(() => ({}))
  try { await saveBill(b, String((g as any).email ?? "staff")); return NextResponse.json({ ok: true }) }
  catch (e) { if (e instanceof BillError) return NextResponse.json({ error: e.message }, { status: 400 }); throw e }
}
