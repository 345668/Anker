import { NextRequest } from "next/server"
import { studioScope } from "@/lib/decks/studio"
import { STUDIO_TEMPLATES } from "@/lib/decks/studio-model"
import { exportStudioDeck } from "@/lib/decks/studio-export"
import { workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
export const runtime = "nodejs"
export async function GET(req: NextRequest) {
  try {
    const scope = await studioScope()
    const template = STUDIO_TEMPLATES.find(t => t.key === req.nextUrl.searchParams.get("template") && t.persona === scope.persona)
    if (!template) throw new WorkspaceError("Template unavailable.", 404)
    return await exportStudioDeck(`Sample ${template.name}`, template.slides, req.nextUrl.searchParams.get("format") || "pptx")
  } catch (e) { return workspaceError(e) }
}
