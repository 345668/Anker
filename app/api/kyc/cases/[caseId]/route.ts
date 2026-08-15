import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCase, setCaseStatus } from "@/lib/modules/kyc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATUSES = ["not_started", "in_progress", "cleared", "escalated", "rejected"]

async function uid(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET(_req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const userId = await uid()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { caseId } = await params
  const data = await getCase(userId, caseId)
  if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const userId = await uid()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { caseId } = await params
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (b.status && !STATUSES.includes(b.status)) return NextResponse.json({ error: "invalid status" }, { status: 400 })
  const kcase = await setCaseStatus(userId, caseId, b.status, typeof b.notes === "string" ? b.notes : undefined)
  if (!kcase) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ case: kcase })
}
