import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { setDocumentStatus, getCase } from "@/lib/modules/kyc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DOC_STATUSES = ["requested", "received", "verified", "rejected"]

export async function PATCH(req: Request, { params }: { params: Promise<{ caseId: string; docId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { caseId, docId } = await params
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!DOC_STATUSES.includes(b.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 })
  const ok = await setDocumentStatus(user.id, caseId, docId, b.status, typeof b.fileUrl === "string" ? b.fileUrl : null)
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const data = await getCase(user.id, caseId)
  return NextResponse.json(data)
}
