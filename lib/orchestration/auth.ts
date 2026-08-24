/**
 * Shared-secret auth for the orchestration API (n8n → Anker).
 *
 * n8n is the outreach "brain": it owns timing + sequence branching and calls
 * back into Anker to enqueue actions and read their results. It is a trusted
 * server-to-server caller acting across users, so it authenticates with a
 * single service key (ORCHESTRATION_API_KEY) — NOT a user session or an
 * extension token — and must name the user it acts for in each request.
 *
 * Mirrors the CRON_SECRET pattern (Bearer $KEY, fail-closed when unset), with
 * a constant-time compare since this key is privileged and cross-user.
 *
 *   const auth = authenticateOrchestration(req)
 *   if (!auth.ok) return auth.response
 */
import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "node:crypto"

export interface OrchestrationAuthOk { ok: true }
export interface OrchestrationAuthErr { ok: false; response: NextResponse }
export type OrchestrationAuthResult = OrchestrationAuthOk | OrchestrationAuthErr

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function authenticateOrchestration(req: NextRequest): OrchestrationAuthResult {
  const key = process.env.ORCHESTRATION_API_KEY
  // Fail closed: no key configured → the endpoint is effectively disabled.
  if (!key) {
    return { ok: false, response: NextResponse.json({ error: "Orchestration API not configured" }, { status: 503 }) }
  }
  const hdr = req.headers.get("authorization") || ""
  const m = hdr.match(/^Bearer\s+(\S+)$/i)
  const presented = m?.[1] || new URL(req.url).searchParams.get("key") || ""
  if (!presented || !safeEqual(presented, key)) {
    return { ok: false, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  return { ok: true }
}
