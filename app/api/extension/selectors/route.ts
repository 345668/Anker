/**
 * GET /api/extension/selectors — serve the LinkedIn DOM selector map.
 *
 * The extension fetches + caches this so LinkedIn DOM changes are a server edit
 * (lib/linkedin/selectors.ts), not a Web Store re-publish. Authenticated so the
 * map isn't a public scraping recipe.
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { getSelectorConfig } from "@/lib/linkedin/selectors"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function GET(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response
  return NextResponse.json({ ok: true, selectors: await getSelectorConfig() }, { headers: corsHeaders() })
}
