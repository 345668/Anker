import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getFundBySlug } from "@/lib/portfolio/funds"
import { listCases, createCase, syncCasesFromFund } from "@/lib/modules/kyc"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function uid(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user?.id ?? null
}

export async function GET() {
  const userId = await uid()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  return NextResponse.json({ cases: await listCases(userId) })
}

export async function POST(req: Request) {
  const userId = await uid()
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch { /* ignore */ }

  if (b?.action === "sync") {
    const fund = await getFundBySlug(typeof b.fundSlug === "string" ? b.fundSlug : "svs-fund-ii")
    if (!fund) return NextResponse.json({ error: "Fund not found" }, { status: 404 })
    const created = await syncCasesFromFund(userId, fund.id)
    return NextResponse.json({ created, cases: await listCases(userId) })
  }

  if (!String(b?.subjectName ?? "").trim()) return NextResponse.json({ error: "subjectName required" }, { status: 400 })
  const kcase = await createCase({
    userId, subjectName: String(b.subjectName),
    subjectType: b.subjectType === "entity" ? "entity" : "individual",
  })
  return NextResponse.json({ case: kcase }, { status: 201 })
}
