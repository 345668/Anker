/**
 * POST /api/founder/extract-profile — read a deck (file, blob upload or link)
 * into a startup profile, with the evidence for each field it can support.
 */
import { NextRequest, NextResponse } from "next/server"
import { extractStartupProfile } from "@/lib/matching/v2/document-extractor"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { readDeckUpload } from "@/lib/matching/deck-upload-server"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  try {
    const context = await matchingContext("founder")
    const { form, pitchDeck, dataRoom } = await readDeckUpload(req, { orgId: context.orgId })
    const hint = (key: string) => (typeof form.get(key) === "string" ? String(form.get(key)).slice(0, 200) : undefined)
    const fields = await extractStartupProfile(pitchDeck, dataRoom, { startupName: hint("startup_name"), founderEmail: hint("founder_email"), orgId: context.orgId })
    return NextResponse.json({ fields, sources: [pitchDeck, ...dataRoom].map((f) => f.name) })
  } catch (error) {
    return matchingFailure(error, "Extraction could not finish. Try again or complete the profile manually.")
  }
}
