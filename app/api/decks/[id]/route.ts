import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { studioScope, deckContext, mapStudioDeck, getStudioDeck } from "@/lib/decks/studio"
import { deckInput } from "@/lib/decks/studio-model"
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json({ deck: await getStudioDeck(await studioScope(), (await params).id) }) }
  catch (e) { return workspaceError(e) }
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const scope = await studioScope(true)
    const input = deckInput.safeParse(await req.json())
    if (!input.success) throw new WorkspaceError("Check slide lengths, deck title and revision before saving.", 400)
    if (input.data.orgId !== scope.orgId) throw new WorkspaceError("Workspace changed. Reload this deck.", 409)
    const { id } = await params
    await getStudioDeck(scope, id)
    const context = await deckContext(scope, input.data.roundId)
    const [row] = await sql`UPDATE workspace_decks SET title = ${input.data.title}, context = ${JSON.stringify(context)}::jsonb,
      slides = ${JSON.stringify(input.data.slides)}::jsonb, revision = revision + 1, updated_at = now()
      WHERE id = ${id} AND user_id = ${scope.userId} AND org_id = ${scope.orgId} AND revision = ${input.data.revision} RETURNING *`
    if (!row) throw new WorkspaceError("This deck changed in another tab. Reload before saving.", 409)
    return NextResponse.json({ deck: mapStudioDeck(row) })
  } catch (e) { return workspaceError(e) }
}
