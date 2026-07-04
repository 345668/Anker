/**
 * POST /api/extension/connections/ingest
 *
 * Batch ingest for the extension's "My Connections" flow. The extension
 * scrolls the user's linkedin.com/mynetwork/.../connections/ page,
 * extracts every card, and posts them in chunks of ~50 at a time.
 *
 * Body: { connections: Array<{ profileSlug, profileUrl, fullName?,
 *                              headline?, title?, firm?, location?,
 *                              imageUrl?, connectedAt? }> }
 *
 * Returns: { inserted, updated, total }
 *
 * Bearer-token auth (matches /api/extension/ingest).
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { upsertConnections, type ConnectionUpsertInput } from "@/lib/network/connections"

export const runtime = "nodejs"
export const maxDuration = 60

export async function OPTIONS() { return corsOptionsResponse() }

export async function POST(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response

  let body: { connections?: any[] } = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: corsHeaders() })
  }
  const raw = Array.isArray(body?.connections) ? body.connections : []
  if (raw.length === 0) {
    return NextResponse.json({ error: "connections: array is required" }, { status: 400, headers: corsHeaders() })
  }
  if (raw.length > 500) {
    return NextResponse.json({ error: "Batch too large — split into ≤ 500 connections per request" }, { status: 413, headers: corsHeaders() })
  }

  // Sanitise every entry — the extension is untrusted, so we accept only
  // known fields and validate slug + URL shape defensively.
  const items: ConnectionUpsertInput[] = []
  for (const c of raw) {
    if (!c || typeof c !== "object") continue
    const slug = typeof c.profileSlug === "string" ? c.profileSlug.trim() : ""
    const url  = typeof c.profileUrl  === "string" ? c.profileUrl.trim()  : ""
    if (!slug || !url) continue
    if (!/^https?:\/\/([a-z-]+\.)?linkedin\.com\//i.test(url)) continue
    items.push({
      profileSlug: slug,
      profileUrl:  url,
      fullName:   optString(c.fullName),
      firstName:  optString(c.firstName),
      lastName:   optString(c.lastName),
      headline:   optString(c.headline),
      title:      optString(c.title),
      firm:       optString(c.firm),
      location:   optString(c.location),
      imageUrl:   optString(c.imageUrl),
      connectedAt: optString(c.connectedAt),
      raw:        typeof c.raw === "object" && c.raw ? c.raw : undefined,
    })
  }
  if (items.length === 0) {
    return NextResponse.json({ error: "No valid connections in payload" }, { status: 400, headers: corsHeaders() })
  }

  try {
    const { inserted, updated } = await upsertConnections(auth.userId, items)
    console.log(`[extension connections] user=${auth.userId} inserted=${inserted} updated=${updated}`)
    return NextResponse.json(
      { ok: true, inserted, updated, total: inserted + updated },
      { headers: corsHeaders() },
    )
  } catch (e: any) {
    console.error("[extension connections ingest]", e)
    return NextResponse.json({ error: e?.message ?? "Ingest failed" }, { status: 500, headers: corsHeaders() })
  }
}

function optString(v: any): string | null {
  if (typeof v !== "string") return null
  const t = v.trim()
  return t.length > 0 ? t : null
}
