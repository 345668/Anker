/**
 * GET /api/extension/li-actions?limit=5
 *
 * The Anker extension polls this to pick up approved outbound actions to
 * execute on LinkedIn. Atomically claims ONLY status='queued' rows (the hard
 * approval gate — pending_approval actions are invisible here), so parallel
 * polls never double-execute. See docs/scope-linkedin-outreach.md §4a.
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateExtension, corsHeaders, corsOptionsResponse } from "@/lib/extension/auth"
import { claimActions } from "@/lib/linkedin/action-queue"

export const runtime = "nodejs"

export async function OPTIONS() { return corsOptionsResponse() }

export async function GET(req: NextRequest) {
  const auth = await authenticateExtension(req)
  if (!auth.ok) return auth.response

  const url = new URL(req.url)
  const limit = Math.min(25, Math.max(1, parseInt(url.searchParams.get("limit") || "5", 10)))

  const items = await claimActions(auth.userId, limit, auth.userId)

  return NextResponse.json({ ok: true, items }, { headers: corsHeaders() })
}
