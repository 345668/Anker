/**
 * Founder profile extraction.
 *
 * Accepts a multipart form with `pitch_deck` (1 file) and zero-or-more
 * `data_room` files. Sends them to Claude (PDF input) and returns the
 * extracted `ExtractedProfileFields` JSON for the UI to populate.
 *
 * Falls back to heuristic extraction when ANTHROPIC_API_KEY is absent.
 */

import { NextRequest, NextResponse } from "next/server"
import { extractStartupProfile, type FileForExtraction } from "@/lib/matching/v2/document-extractor"

export const runtime = "nodejs"
export const maxDuration = 120

const MAX_PDF_BYTES = 25 * 1024 * 1024 // 25 MB

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const startupName = (form.get("startup_name") as string | null) ?? undefined
    const founderEmail = (form.get("founder_email") as string | null) ?? undefined

    const pitchDeckFile = form.get("pitch_deck") as File | null
    const dataRoomFiles = form.getAll("data_room").filter((v): v is File => v instanceof File)

    let pitchDeck: FileForExtraction | null = null
    if (pitchDeckFile) {
      pitchDeck = await fileToExtraction(pitchDeckFile)
    }
    const dataRoom: FileForExtraction[] = []
    for (const f of dataRoomFiles) dataRoom.push(await fileToExtraction(f))

    if (!pitchDeck && !dataRoom.length) {
      return NextResponse.json(
        { error: "Upload at least a pitch deck or one data-room file." },
        { status: 400 },
      )
    }

    const fields = await extractStartupProfile(pitchDeck, dataRoom, {
      startupName,
      founderEmail,
    })
    // Surface which provider+model actually ran so the UI can warn
    // when a fallback model was used (e.g. user hasn't pulled the
    // routed model yet).  Cheap — both helpers are cached.
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
    console.error("[extract-profile] Error:", e)
    return NextResponse.json({ error: e?.message ?? "Unknown" }, { status: 500 })
  }
}

async function fileToExtraction(file: File): Promise<FileForExtraction> {
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
  // For text/plain, csv, json, etc — read as text
  const text = await file.text()
  return {
    name: file.name,
    contentType: file.type || "text/plain",
    base64: "",
    text: text.slice(0, 200_000), // cap at 200K chars
  }
}
