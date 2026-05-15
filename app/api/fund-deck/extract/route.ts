/**
 * Fund profile extraction.
 *
 * POST multipart with:
 *   - `pitch_deck`  (PDF, optional)   — the GP's deck
 *   - `data_room`   (PDF/text, 0..n)  — DDQ, performance attestations, etc.
 *   - `fund_name`, `gp_email`         — optional hints
 *
 * Returns `{ fields: ExtractedFundFields }` for the LP-matchmaking form
 * to pre-populate.  Falls back to heuristic extraction when no AI key.
 */

import { NextRequest, NextResponse } from "next/server"
import {
  extractFundProfile,
  type FileForFundExtraction,
} from "@/lib/ai/fund-deck-extractor"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_PDF_BYTES = 25 * 1024 * 1024 // 25 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const fundName = (form.get("fund_name") as string | null) ?? undefined
    const gpEmail = (form.get("gp_email") as string | null) ?? undefined

    const pitchDeckFile = form.get("pitch_deck") as File | null
    const dataRoomFiles = form.getAll("data_room").filter((v): v is File => v instanceof File)

    let pitchDeck: FileForFundExtraction | null = null
    if (pitchDeckFile) pitchDeck = await fileToExtraction(pitchDeckFile)

    const dataRoom: FileForFundExtraction[] = []
    for (const f of dataRoomFiles) dataRoom.push(await fileToExtraction(f))

    if (!pitchDeck && !dataRoom.length) {
      return NextResponse.json(
        { error: "Upload at least a pitch deck or one data-room file." },
        { status: 400 },
      )
    }

    const fields = await extractFundProfile(pitchDeck, dataRoom, { fundName, gpEmail })
    const { providerInfo, listAvailableOllamaModels, pickAvailableOllamaModel } = await import("@/lib/ai/provider")
    const { modelForTask } = await import("@/lib/ai/model-router")
    const info = await providerInfo()
    let ai: any = { provider: info.provider, model: info.model, requestedModel: info.model }
    if (info.provider === "ollama") {
      const requested = modelForTask("deck_extract")
      const used = await pickAvailableOllamaModel(requested)
      const available = await listAvailableOllamaModels()
      ai = {
        provider: "ollama",
        requestedModel: requested,
        usedModel: used,
        modelMissing: !!used && used !== requested,
        availableModels: available,
      }
    }
    return NextResponse.json({ fields, ai })
  } catch (e: any) {
    console.error("[fund-deck/extract] error:", e)
    return NextResponse.json({ error: e?.message ?? "Extraction failed" }, { status: 500 })
  }
}

async function fileToExtraction(file: File): Promise<FileForFundExtraction> {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name)
  if (isPdf) {
    if (file.size > MAX_PDF_BYTES) {
      throw new Error(
        `${file.name} is too large (${(file.size / 1e6).toFixed(1)}MB). Max ${(MAX_PDF_BYTES / 1e6).toFixed(0)}MB per file.`,
      )
    }
    const buf = await file.arrayBuffer()
    return {
      name: file.name,
      contentType: "application/pdf",
      base64: Buffer.from(buf).toString("base64"),
    }
  }
  const text = await file.text()
  return {
    name: file.name,
    contentType: file.type || "text/plain",
    base64: "",
    text: text.slice(0, 200_000),
  }
}
