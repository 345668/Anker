import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { addCovenant, listCovenants } from "@/lib/modules/loan-servicing"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const KINDS = ["financial", "reporting", "affirmative", "negative"]

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { id } = await params
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }
  if (!String(b?.name ?? "").trim()) return NextResponse.json({ error: "name required" }, { status: 400 })
  const cov = await addCovenant({
    userId: user.id, loanId: id, name: String(b.name),
    kind: KINDS.includes(b.kind) ? b.kind : "financial",
    requirement: b.requirement ?? null,
  })
  if (!cov) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ covenant: cov, covenants: await listCovenants(id) })
}
