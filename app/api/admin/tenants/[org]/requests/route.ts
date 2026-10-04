/**
 * Tenant export and erasure requests, called by SAIL (docs/architecture/41 §6). Portal service principal only: SAIL has already checked the staff role
 * and a fresh two-factor code, so a signed-in platform admin cannot reach these from a browser and skip that.
 *   GET   -> { requests }
 *   POST  { action: "export" | "dry_run" | "schedule" | "cancel", requestId?, confirmName? }   header x-portal-staff-email names the operator
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { RequestError, cancelRequest, listRequests, requestDryRun, requestExport, scheduleErasure } from "@/lib/tenant/requests"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

async function operator(req: NextRequest): Promise<{ email: string } | NextResponse> {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  if (guard.id !== "portal-service") return NextResponse.json({ error: "These actions are only available through the staff portal." }, { status: 403 })
  const email = (req.headers.get("x-portal-staff-email") || "").trim()
  if (!email) return NextResponse.json({ error: "The operator is not named." }, { status: 400 })
  return { email }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ org: string }> }) {
  const op = await operator(req); if (op instanceof NextResponse) return op
  return NextResponse.json({ requests: await listRequests((await ctx.params).org) }, { headers: { "Cache-Control": "private, no-store" } })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ org: string }> }) {
  const op = await operator(req); if (op instanceof NextResponse) return op
  const org = (await ctx.params).org
  const b = await req.json().catch(() => ({}))
  try {
    switch (b?.action) {
      case "export": return NextResponse.json(await requestExport(org, op.email))
      case "dry_run": return NextResponse.json(await requestDryRun(org, op.email))
      case "schedule": return NextResponse.json(await scheduleErasure(String(b.requestId ?? ""), { confirmName: String(b.confirmName ?? ""), approvedBy: op.email }))
      case "cancel": await cancelRequest(String(b.requestId ?? ""), op.email); return NextResponse.json({ ok: true })
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 })
    }
  } catch (e) {
    if (e instanceof RequestError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[tenant requests]", (e as Error).message)
    return NextResponse.json({ error: "The request failed. Nothing was changed that cannot be repeated." }, { status: 500 })
  }
}
