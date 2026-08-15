import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  listInformationSharing,
  setInformationSharing,
  SHARING_CATEGORIES,
  type SharingCategory,
} from "@/lib/portfolio/information-sharing"

export const dynamic = "force-dynamic"

async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function GET(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const fundId = new URL(req.url).searchParams.get("fundId")
  if (!fundId) return NextResponse.json({ error: "fundId required" }, { status: 400 })
  try {
    return NextResponse.json({ rows: await listInformationSharing(fundId) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "load failed", rows: [] }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  if (!(await requireUser())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  let fundId = "", lpId = "", category = "", value = false
  try {
    const body = await req.json()
    fundId = String(body.fundId || "")
    lpId = String(body.lpId || "")
    category = String(body.category || "")
    value = Boolean(body.value)
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 })
  }
  if (!fundId || !lpId || !SHARING_CATEGORIES.includes(category as SharingCategory)) {
    return NextResponse.json({ error: "fundId, lpId and a valid category are required" }, { status: 400 })
  }
  try {
    const row = await setInformationSharing(fundId, lpId, category as SharingCategory, value)
    if (!row) return NextResponse.json({ error: "LP not found in fund" }, { status: 404 })
    return NextResponse.json({ row })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "update failed" }, { status: 500 })
  }
}
