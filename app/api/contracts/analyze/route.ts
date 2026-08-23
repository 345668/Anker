/**
 * POST /api/contracts/analyze — clause analysis + redline-vs-playbook for a pasted
 * contract. Body: { text: string, contractType?: string }. The model analyzes clauses;
 * the risk score is computed deterministically from the playbook (lib/contracts/analyzer).
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { analyzeContract } from "@/lib/contracts/analyzer"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { text?: string; contractType?: string }
  if (!String(body.text ?? "").trim()) return NextResponse.json({ error: "Provide contract 'text'." }, { status: 400 })

  const result = await analyzeContract({ text: String(body.text), contractType: body.contractType })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 422 })
  return NextResponse.json(result)
}
