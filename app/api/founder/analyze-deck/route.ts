/**
 * Pitch deck analyzer endpoint.
 * POST multipart with field `pitch_deck` (PDF). Returns DeckScores JSON.
 */
import { NextRequest, NextResponse } from "next/server"
import { analyzeDeck } from "@/lib/ai/pitch-deck-analyzer"

export const runtime = "nodejs"
export const maxDuration = 180

const MAX_BYTES = 25 * 1024 * 1024

export async function POST(req: NextRequest) {
  try {
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
    const result = await analyzeDeck({
      filename: file.name,
      pdfBase64: buf.toString("base64"),
      pdfBuffer: buf,
    })
    return NextResponse.json({ filename: file.name, sizeBytes: file.size, result })
  } catch (e: any) {
    console.error("[analyze-deck] error:", e)
    return NextResponse.json({ error: e?.message ?? "Analysis failed" }, { status: 500 })
  }
}
