import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getUserWorkspace, parseWorkspaceInput, updateUserWorkspace } from "@/lib/org/workspaces"

export const runtime = "nodejs"

async function userId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET(_req: Request, context: { params: Promise<{ orgId: string }> }) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { orgId } = await context.params
  try {
    const workspace = await getUserWorkspace(id, orgId)
    if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    return NextResponse.json({ workspace })
  } catch { return NextResponse.json({ error: "Workspace could not be loaded. Please retry." }, { status: 503 }) }
}

export async function PATCH(req: Request, context: { params: Promise<{ orgId: string }> }) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const { orgId } = await context.params
  try {
    const input = parseWorkspaceInput(await req.json())
    const workspace = await updateUserWorkspace(id, orgId, input)
    return NextResponse.json({ ok: true, workspace })
  } catch (error: any) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    if (error?.code === "CONFLICT") return NextResponse.json({ error: error.message }, { status: 409 })
    if (error?.name === "ZodError") return NextResponse.json({ error: error.issues?.[0]?.message ?? "Invalid workspace details" }, { status: 400 })
    if (error?.code === "NOT_FOUND") return NextResponse.json({ error: "Workspace not found" }, { status: 404 })
    if (error?.code === "FORBIDDEN") return NextResponse.json({ error: error.message }, { status: 403 })
    if (error?.code === "INVALID_KIND") return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ error: "Workspace could not be saved. Please retry." }, { status: 503 })
  }
}
