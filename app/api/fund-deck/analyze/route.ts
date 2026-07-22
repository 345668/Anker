/**
 * Fund deck analyzer endpoint.
 *
 * POST multipart with `pitch_deck` (PDF). Optional fields:
 *   - `emerging_manager`  "true" | "false"  — toggles scoring lens
 *   - `fund_name`, `vehicle`, `fund_number`, `target_raise`, `sectors`
 *      — context the model uses to ground its analysis
 *
 * Returns `{ filename, sizeBytes, result }` where `result` is FundDeckScores.
 */

import { NextRequest, NextResponse } from "next/server"
import { analyzeFundDeck } from "@/lib/ai/fund-deck-analyzer"
import { requireUser } from "@/lib/auth/require-user"
import { rateLimit, rateLimitResponse, AI_HEAVY } from "@/lib/rate-limit"

export const runtime = "nodejs"
export const maxDuration = 240 // analysis is heavier than a startup deck

const MAX_BYTES = 25 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
    // Auth: this route spends up to 240s of paid multi-provider AI per call.
    // Gate it to signed-in users so it can't be run as an open cost sink.
    const auth = await requireUser()
    if (auth instanceof NextResponse) return auth
    const rl = rateLimit(`fund-deck-analyze:${auth.id}`, AI_HEAVY)
    if (!rl.ok) return rateLimitResponse(rl)

    const form = await req.formData()
    const file = form.get("pitch_deck") as File | null
    if (!file) {
      return NextResponse.json({ error: "Upload a PDF as `pitch_deck`." }, { status: 400 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `File too large (max ${MAX_BYTES / 1e6}MB)` }, { status: 400 })
    }

    const ab = await file.arrayBuffer()
    const buf = Buffer.from(ab)

    const emergingFlag = (form.get("emerging_manager") as string | null) ?? null
    const emergingManager =
      emergingFlag === null || emergingFlag === "" ? undefined : emergingFlag === "true"

    const context: any = {}
    const fundName = form.get("fund_name") as string | null
    const vehicle = form.get("vehicle") as string | null
    const fundNumber = form.get("fund_number") as string | null
    const targetRaise = form.get("target_raise") as string | null
    const sectors = form.get("sectors") as string | null
    if (fundName) context.name = fundName
    if (vehicle) context.vehicle = vehicle
    if (fundNumber && Number.isFinite(Number(fundNumber))) context.fundNumber = Math.round(Number(fundNumber))
    if (targetRaise && Number.isFinite(Number(targetRaise))) context.targetRaise = Math.round(Number(targetRaise))
    if (sectors) context.sectors = sectors.split(",").map((s) => s.trim()).filter(Boolean)

    console.log("[fund-deck/analyze] Starting analysis for file:", file.name, "size:", file.size)
    
    const result = await analyzeFundDeck({
      filename: file.name,
      pdfBase64: buf.toString("base64"),
      pdfBuffer: buf,
      emergingManager,
      context: Object.keys(context).length ? context : undefined,
    })

    console.log("[fund-deck/analyze] Analysis completed, overall score:", result.overall)
    
    return NextResponse.json({ filename: file.name, sizeBytes: file.size, result })
  } catch (e: any) {
    console.error("[fund-deck/analyze] error:", e?.message || e, e?.stack)
    return NextResponse.json({ 
      error: e?.message ?? "Analysis failed",
      details: process.env.NODE_ENV === 'development' ? e?.stack : undefined
    }, { status: 500 })
  }
}
