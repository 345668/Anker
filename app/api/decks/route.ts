import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { studioScope, deckContext, mapStudioDeck } from "@/lib/decks/studio"
import { STUDIO_TEMPLATES } from "@/lib/decks/studio-model"
export async function GET() {
  try {
    const scope = await studioScope()
    const context = await deckContext(scope, null)
    const rows = await sql`SELECT * FROM workspace_decks WHERE user_id = ${scope.userId} AND org_id = ${scope.orgId} AND (context->>'fundId') IS NOT DISTINCT FROM ${context.fundId} ORDER BY updated_at DESC LIMIT 200`
    const rounds = scope.persona === "founder" ? await sql`SELECT id, name FROM fundraising_rounds WHERE user_id = ${scope.userId} AND org_id = ${scope.orgId} ORDER BY created_at DESC` : []
    return NextResponse.json({ decks: rows.map(mapStudioDeck), context, rounds, canWrite: scope.canWrite, templates: STUDIO_TEMPLATES.filter(t => t.persona === scope.persona) })
  } catch (e) { return workspaceError(e) }
}
export async function POST(req: NextRequest) {
  try {
    const scope = await studioScope(true)
    const body = await req.json()
    if (body.orgId !== scope.orgId) throw new WorkspaceError("Workspace changed. Reload before creating a deck.", 409)
    const template = STUDIO_TEMPLATES.find(t => t.key === body.templateKey && t.persona === scope.persona)
    if (!template) throw new WorkspaceError("Choose a template for this workspace.", 400)
    const context = await deckContext(scope, typeof body.roundId === "string" ? body.roundId : null)
    const slides = template.slides.map((s, i) => i === 0 ? { ...s, title: scope.name.slice(0,100) } : s)
    const [row] = await sql`INSERT INTO workspace_decks(user_id, org_id, template_key, title, context, slides)
      VALUES (${scope.userId}, ${scope.orgId}, ${template.key}, ${`${scope.name} — ${template.name}`.slice(0,100)}, ${JSON.stringify(context)}::jsonb, ${JSON.stringify(slides)}::jsonb) RETURNING *`
    return NextResponse.json({ deck: mapStudioDeck(row) }, { status: 201 })
  } catch (e) { return workspaceError(e) }
}
