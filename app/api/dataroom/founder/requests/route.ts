import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listDocumentRequests, resolveDocumentRequest } from "@/lib/portfolio/data-room"
import { resolveFounderCompanyId } from "@/lib/dataroom/founder-scope"

export const runtime = "nodejs"

async function companyFor(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  return resolveFounderCompanyId(user.id)
}

/** GET — the founder's document requests. */
export async function GET() {
  const companyId = await companyFor()
  if (!companyId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  return NextResponse.json({ requests: await listDocumentRequests({ companyId }) })
}

/** PATCH { id, status } — mark a request fulfilled/dismissed. */
export async function PATCH(req: NextRequest) {
  const companyId = await companyFor()
  if (!companyId) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  let body: any = {}
  try { body = await req.json() } catch { /* ignore */ }
  const id = String(body?.id ?? "")
  const status = body?.status === "dismissed" ? "dismissed" : "fulfilled"
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 })
  const ok = await resolveDocumentRequest(id, status, { companyId })
  return NextResponse.json({ ok })
}
