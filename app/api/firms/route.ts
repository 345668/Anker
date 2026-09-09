import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { searchDiscovery, discoveryQuery } from "@/lib/platform/discovery"
export const dynamic = "force-dynamic"
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  const params = new URL(request.url).searchParams
  try { discoveryQuery("firms", params) } catch (e) { return NextResponse.json({ error: "Invalid filter or pagination" }, { status: 400 }) }
  try { return NextResponse.json(await searchDiscovery("firms", params)) }
  catch { return NextResponse.json({ error: "Could not load records. Please retry." }, { status: 503 }) }
}
