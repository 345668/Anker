/**
 * GET /api/orchestration/health — authed connectivity check for n8n.
 *
 * Returns 200 only when ORCHESTRATION_API_KEY is set AND the caller presents
 * it. Lets an n8n workflow (or a deploy smoke test) confirm the seam is wired
 * before running real sequences.
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateOrchestration } from "@/lib/orchestration/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  const auth = authenticateOrchestration(req)
  if (!auth.ok) return auth.response
  return NextResponse.json({ ok: true, service: "anker-orchestration", ts: new Date().toISOString() })
}
