/**
 * GET /api/admin/model-prices -> every model called in the last 30 days (and every table price) with where its price comes from.
 * POST { unit, priceUsd, verified?, note? } -> saves the price of one metered unit (speech second, character, embedding token, page, image, video second).
 * POST { model, priceIn, priceOut, verified?, note? } -> saves a list price in USD per million tokens (docs/architecture/58). Portal service principal only.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { listPrices, listUnitPrices, PriceError, savePrice, saveUnitPrice } from "@/lib/ai/price-admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function guard() {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  if (g.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  return g
}
export async function GET() {
  const g = await guard(); if (g instanceof NextResponse) return g
  return NextResponse.json({ prices: await listPrices(), units: await listUnitPrices() })
}
export async function POST(req: NextRequest) {
  const g = await guard(); if (g instanceof NextResponse) return g
  const b = await req.json().catch(() => ({}))
  try { if (b?.unit) await saveUnitPrice(b, String((g as any).email ?? "staff")); else await savePrice(b, String((g as any).email ?? "staff")); return NextResponse.json({ ok: true }) }
  catch (e) { if (e instanceof PriceError) return NextResponse.json({ error: e.message }, { status: 400 }); throw e }
}
