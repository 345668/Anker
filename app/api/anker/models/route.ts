/**
 * GET /api/anker/models — the ANKER AI model catalog for the picker.
 * Returns all models grouped by category; the client marks chat/vision/omni as
 * selectable conversation models and the rest as tools.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { MODEL_CATALOG, CHATTABLE, DEFAULT_CHAT_MODEL } from "@/lib/ai/model-catalog"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  return NextResponse.json({
    default: DEFAULT_CHAT_MODEL,
    chattable: CHATTABLE,
    models: MODEL_CATALOG,
  })
}
