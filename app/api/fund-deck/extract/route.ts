import { NextRequest, NextResponse } from "next/server"
import { extractFundProfile } from "@/lib/ai/fund-deck-extractor"
import { matchingContext, matchingFailure } from "@/lib/matching/access"
import { readDeckUpload } from "@/lib/matching/deck-upload-server"
export const runtime = "nodejs"
export const maxDuration = 120
export async function POST(req: NextRequest) {
  try {
    await matchingContext("vc")
    const { form, pitchDeck, dataRoom } = await readDeckUpload(req)
    const hint = (key: string) => typeof form.get(key) === "string" ? String(form.get(key)).slice(0, 200) : undefined
    const fields = await extractFundProfile(pitchDeck, dataRoom, { fundName: hint("fund_name"), gpEmail: hint("gp_email") })
    return NextResponse.json({ fields })
  } catch (error) { return matchingFailure(error, "Extraction could not finish. Try again or complete the profile manually.") }
}
