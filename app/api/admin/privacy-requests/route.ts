/**
 * Privacy requests for directory persons, called by SAIL (docs/architecture/54, D3). Portal service principal only: SAIL has already checked the staff role.
 *   GET -> { requests }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { listRequests } from "@/lib/privacy/dsar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  if (guard.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  return NextResponse.json({ requests: await listRequests() }, { headers: { "Cache-Control": "private, no-store" } })
}
