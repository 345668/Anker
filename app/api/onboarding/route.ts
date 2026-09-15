import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { completeOnboarding, onboardingWorkspaceInput } from "@/lib/org/provision"
import { getUserWorkspace } from "@/lib/org/workspaces"
import { setActiveOrgCookie } from "@/lib/org/active"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { sql } from "@/lib/db"
export const runtime = "nodejs"

const draftSchema = z.object({
  account_type: z.enum(["founder", "vc"]), step: z.number().int().min(0).max(3),
  revision: z.number().int().nonnegative(), completed: z.boolean().default(false),
  data: z.record(z.string(), z.unknown()).superRefine((data, ctx) => {
    if (JSON.stringify(data).length > 50000) ctx.addIssue({ code: "custom", message: "Setup details are too large." })
    for (const key of ["name", "company", "firm", "website", "title", "email", "linkedin", "stage", "oneliner", "geography", "target", "timeline", "instrument", "use", "vintage", "size", "checkMin", "checkMax", "stageFocus", "geo", "notes", "deck", "deckUpload", "deckExtraction", "deckDocumentId"]) {
      if (data[key] != null && (typeof data[key] !== "string" || data[key].length > 5000)) ctx.addIssue({ code: "custom", path: [key], message: `Enter valid text for ${key}.` })
    }
    for (const key of ["sectors", "theses", "lpTypes"]) {
      if (data[key] != null && (!Array.isArray(data[key]) || data[key].length > 20 || data[key].some(v => typeof v !== "string" || v.length > 80))) ctx.addIssue({ code: "custom", path: [key], message: `Choose valid ${key}.` })
    }
  }),
})
function failure(error: unknown) {
  if (error instanceof z.ZodError) return NextResponse.json({ error: error.issues[0]?.message || "Check your setup details." }, { status: 400 })
  if (error instanceof WorkspaceError) return NextResponse.json({ error: error.message }, { status: error.status })
  // Never log the draft: it contains personal information and company plans.
  const code = (error as { code?: string })?.code
  console.error("[onboarding] persistence failed", { code: code || "unknown" })
  const schemaMissing = code === "42P01" || code === "42703"
  return NextResponse.json({ error: schemaMissing
    ? "Workspace setup is temporarily unavailable because a database update is pending. Your entries remain here; contact support and retry after the update."
    : "Could not save setup. Your entries are still here; please retry.", code: schemaMissing ? "SETUP_SCHEMA_PENDING" : "SETUP_UNAVAILABLE" }, { status: 503 })
}
async function linkedWorkspace(userId: string, draft: any) {
  if (!draft?.workspace_id) return null
  const workspace = await getUserWorkspace(userId, draft.workspace_id)
  if (!workspace || workspace.persona !== draft.persona) throw new WorkspaceError("Your access to the setup workspace has changed. Open Manage workspaces to select an available workspace.", 403)
  return workspace
}

export async function GET(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to resume setup" }, { status: 401 })
  const persona = new URL(req.url).searchParams.get("persona")
  if (persona !== "founder" && persona !== "vc") return NextResponse.json({ error: "Invalid path" }, { status: 400 })
  try {
    const [draft] = await sql`SELECT data, step, revision, completed, workspace_id, persona FROM onboarding_drafts WHERE user_id = ${user.id} AND persona = ${persona}`
    const workspace = await linkedWorkspace(user.id, draft)
    return NextResponse.json({ ok: true, workspace, draft: draft ? { ...draft, completed: !!workspace && draft.completed,
      needsRepair: draft.completed && !workspace } : null }, { headers: { "Cache-Control": "private, no-store" } })
  } catch (error) { return failure(error) }
}

export async function POST(req: NextRequest) {
  const { data: { user } } = await (await createClient()).auth.getUser()
  if (!user) return NextResponse.json({ error: "Sign in to save setup" }, { status: 401 })
  const parsed = draftSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return failure(parsed.error)
  const body = parsed.data
  try {
    if (body.completed) {
      if (body.step !== 3 || typeof body.data.name !== "string" || !body.data.name.trim()) throw new WorkspaceError("Review your name and company or fund details before finishing setup.", 400)
      onboardingWorkspaceInput(body.account_type, body.data)
      // Recover a lost completion response or cookie failure without changing data.
      const [saved] = await sql`SELECT workspace_id, completed, persona, revision FROM onboarding_drafts WHERE user_id = ${user.id} AND persona = ${body.account_type}`
      if (saved?.completed && saved.workspace_id) {
        const workspace = await linkedWorkspace(user.id, saved)
        await setActiveOrgCookie(workspace!.orgId)
        return NextResponse.json({ ok: true, persisted: true, revision: saved.revision, completed: true, workspace })
      }
    }
    const rows = await sql`
      INSERT INTO onboarding_drafts (user_id, persona, data, step, revision)
      SELECT ${user.id}, ${body.account_type}, ${JSON.stringify(body.data)}::jsonb, ${body.step}, 1 WHERE ${body.revision === 0}
      ON CONFLICT (user_id, persona) DO NOTHING RETURNING revision
    `
    const updated = rows.length ? rows : await sql`
      UPDATE onboarding_drafts SET data = ${JSON.stringify(body.data)}::jsonb, step = ${body.step}, revision = revision + 1, updated_at = now()
      WHERE user_id = ${user.id} AND persona = ${body.account_type} AND revision = ${body.revision}
        AND (completed = false OR workspace_id IS NULL) RETURNING revision
    `
    if (!updated.length) throw new WorkspaceError("This draft changed in another tab. Reload to resume the latest saved setup.", 409)
    const revision = Number(updated[0].revision)
    if (!body.completed) return NextResponse.json({ ok: true, persisted: true, revision, completed: false })
    try {
      const workspace = await completeOnboarding(user.id, body.account_type, revision, body.data)
      await setActiveOrgCookie(workspace.orgId)
      return NextResponse.json({ ok: true, persisted: true, revision, completed: true, workspace })
    } catch (error) {
      const response = failure(error)
      return NextResponse.json({ ...(await response.json()), revision }, { status: response.status })
    }
  } catch (error) { return failure(error) }
}
