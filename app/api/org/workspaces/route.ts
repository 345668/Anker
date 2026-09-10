import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { resolveActiveMembership } from "@/lib/org/active"
import { createUserWorkspace, listUserWorkspaces, parseWorkspaceInput } from "@/lib/org/workspaces"

export const runtime = "nodejs"

async function userId() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET() {
  const id = await userId()
  if (!id) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  try {
    const [{ active }, workspaces] = await Promise.all([resolveActiveMembership(id), listUserWorkspaces(id)])
    return NextResponse.json({ workspaces, activeOrgId: active?.orgId ?? null })
  } catch {
    return NextResponse.json({ error: "Workspaces could not be loaded. Please retry." }, { status: 503 })
  }
}

export async function POST(req: Request) {
  const id = await userId()
  if (!id) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  try {
    const input = parseWorkspaceInput(await req.json())
    const workspace = await createUserWorkspace(id, input)
    return NextResponse.json({ ok: true, workspace }, { status: 201 })
  } catch (error: any) {
    if (error instanceof SyntaxError) return NextResponse.json({ error: "Invalid request body" }, { status: 400 })
    if (error?.name === "ZodError") return NextResponse.json({ error: error.issues?.[0]?.message ?? "Invalid workspace details" }, { status: 400 })
    return NextResponse.json({ error: "Workspace could not be created. Please retry." }, { status: 503 })
  }
}
