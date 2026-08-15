import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listLpNotices } from "@/lib/portfolio/lp-notices"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const fundId = new URL(req.url).searchParams.get("fundId")
  if (!fundId) return NextResponse.json({ error: "fundId required" }, { status: 400 })
  return NextResponse.json({ notices: await listLpNotices(fundId) })
}
