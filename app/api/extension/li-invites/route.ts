/**
 * POST /api/extension/li-invites
 *
 * The extension posts the profile URLs of accepted connection invitations here.
 * Matches them to active campaign members and stamps accepted_at (idempotent),
 * which drives the funnel + 'if_accepted' branching. See lib/linkedin/invites.ts.
 *
 * Body: { accepted: string[] }   // profile URLs that have accepted
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { recordAcceptances } from "@/lib/linkedin/invites"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function POST(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => ({}))
  const accepted = Array.isArray(body.accepted) ? body.accepted.filter((x: unknown) => typeof x === "string") : []
  try {
    const marked = await recordAcceptances(auth.userId, accepted)
    return NextResponse.json({ ok: true, marked }, { headers: corsHeaders() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ingest failed" }, { status: 400, headers: corsHeaders() })
  }
}
