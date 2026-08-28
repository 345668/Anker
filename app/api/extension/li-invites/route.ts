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
import { recordAcceptances, markAcceptedFromPending, markAcceptedFromConnections } from "@/lib/linkedin/invites"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function POST(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response
  const body = await req.json().catch(() => ({}))
  const accepted = Array.isArray(body.accepted) ? body.accepted.filter((x: unknown) => typeof x === "string") : []
  const pending = Array.isArray(body.pending) ? body.pending.filter((x: unknown) => typeof x === "string") : null
  try {
    let marked = 0
    if (accepted.length) marked += await recordAcceptances(auth.userId, accepted)
    // A pending array (even empty) means "here's the full pending set" → infer
    // acceptances by absence.
    if (pending) marked += await markAcceptedFromPending(auth.userId, pending)
    // Definitive pass: anyone now a 1st-degree connection has accepted.
    marked += await markAcceptedFromConnections(auth.userId)
    return NextResponse.json({ ok: true, marked }, { headers: corsHeaders() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Ingest failed" }, { status: 400, headers: corsHeaders() })
  }
}
