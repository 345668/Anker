import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requestDocument, getCase } from "@/lib/modules/kyc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { caseId } = await params
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!String(b?.docType ?? "").trim()) return NextResponse.json({ error: "docType required" }, { status: 400 })
  const doc = await requestDocument(user.id, caseId, String(b.docType), typeof b.label === "string" ? b.label : null)
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 })
  const data = await getCase(user.id, caseId)
  return NextResponse.json({ document: doc, ...data })
}
