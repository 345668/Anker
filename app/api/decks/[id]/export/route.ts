import { NextRequest } from "next/server"
import { studioScope, getStudioDeck } from "@/lib/decks/studio"
import { exportStudioDeck } from "@/lib/decks/studio-export"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
export const runtime = "nodejs"
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const deck = await getStudioDeck(await studioScope(), (await params).id)
    if (req.nextUrl.searchParams.get("revision") !== String(deck.revision)) throw new WorkspaceError("The saved deck changed. Reload it before downloading.", 409)
    return await exportStudioDeck(deck.title, deck.slides, req.nextUrl.searchParams.get("format") || "pptx")
  } catch (e) { return workspaceError(e) }
}
