import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { extractStartupProfile } from "@/lib/matching/v2/document-extractor"
import { readDeckUpload } from "@/lib/matching/deck-upload-server"
import { matchingFailure } from "@/lib/matching/access"

export const runtime = "nodejs"
export const maxDuration = 120

/** Reads only the supplied file; never reads another workspace's documents. */
export async function POST(req: Request) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to read your deck." }, { status: 401 })
  try {
    const { pitchDeck, dataRoom } = await readDeckUpload(req)
    const fields = await extractStartupProfile(pitchDeck, dataRoom, { founderEmail: user.email })
    return NextResponse.json({ fields }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return matchingFailure(error, "Your deck could not be read. Enter the company details manually or try again.") }
}
