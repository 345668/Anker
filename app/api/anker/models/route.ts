/**
 * GET /api/anker/models — the ANKER AI model catalog for the picker.
 * Returns all models grouped by category; the client marks chat/vision/omni as
 * selectable conversation models and the rest as tools.
 *
 * Each model also carries `configured`: whether the platform actually holds a key
 * for its provider (doc 32). The catalogue now lists frontier models before their
 * keys are bought, so without this the picker would offer a menu of choices that
 * each fail on selection. The refusal is still the backstop — for a client that
 * ignores the flag, or a key revoked between listing and sending — but a user
 * should be able to see what will work before picking.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { MODEL_CATALOG, CHATTABLE, DEFAULT_CHAT_MODEL, RUNTIME_PROVIDER } from "@/lib/ai/model-catalog"
import { providerConfigured } from "@/lib/ai/model-router"
import { readRouterConfig } from "@/lib/ai/runtime-config"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 })

  // Never fail the picker over the config read: a catalogue with unknown
  // availability is far better than no catalogue. A null config means every
  // provider reports unconfigured, which is the honest answer when we cannot tell
  // — and the pick is refused with `not-configured` for the same reason, so the
  // listing and the refusal agree.
  const cfg = await readRouterConfig().catch(() => null)

  return NextResponse.json({
    default: DEFAULT_CHAT_MODEL,
    chattable: CHATTABLE,
    models: MODEL_CATALOG.map((m) => ({
      ...m,
      configured: providerConfigured(RUNTIME_PROVIDER[m.provider], cfg),
    })),
  })
}
