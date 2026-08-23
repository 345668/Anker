/**
 * GET  /api/forecasting/scenarios      — the current user's saved scenarios.
 * POST /api/forecasting/scenarios      — save/overwrite a scenario. Body: { name, params }.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listScenarios, saveScenario, normalizeParams } from "@/lib/forecasting/scenarios"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })
  return NextResponse.json({ scenarios: await listScenarios(user.id) })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { name?: string; params?: unknown }
  const name = String(body.name ?? "").trim()
  if (!name) return NextResponse.json({ error: "Provide a scenario 'name'." }, { status: 400 })
  if (name.length > 80) return NextResponse.json({ error: "Name is too long (max 80 chars)." }, { status: 400 })

  try {
    const scenario = await saveScenario(user.id, name, normalizeParams(body.params))
    return NextResponse.json({ ok: true, scenario })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Save failed (scenarios table may not be migrated)." }, { status: 500 })
  }
}
