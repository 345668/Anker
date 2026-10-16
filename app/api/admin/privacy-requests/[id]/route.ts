/**
 * One privacy request, called by SAIL (docs/architecture/54, D3). Portal service principal only; header x-portal-staff-email names the operator.
 *   GET  -> { request, details, found }
 *   POST { action: "access" | "rectify" | "restrict" | "refuse" | "extend" | "erase", ids?, changes?, reason?, days? }
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { DsarError, erase, extend, getRequest, refuse, rectify, restrict, sendAccess } from "@/lib/privacy/dsar"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function operator(req: NextRequest): Promise<{ email: string } | NextResponse> {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  if (guard.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  const email = (req.headers.get("x-portal-staff-email") || "").trim()
  if (!email) return NextResponse.json({ error: "The operator is not named." }, { status: 400 })
  return { email }
}
const idOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id)

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const op = await operator(req); if (op instanceof NextResponse) return op
  const { id } = await ctx.params; if (!idOk(id)) return NextResponse.json({ error: "Unknown request." }, { status: 404 })
  try { return NextResponse.json(await getRequest(id), { headers: { "Cache-Control": "private, no-store" } }) } catch (e) { return fail(e) }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const op = await operator(req); if (op instanceof NextResponse) return op
  const { id } = await ctx.params; if (!idOk(id)) return NextResponse.json({ error: "Unknown request." }, { status: 404 })
  const b = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(b?.ids) ? b.ids.map(String).slice(0, 200) : []
  try {
    switch (b?.action) {
      case "access": return NextResponse.json(await sendAccess(id, op.email, ids))
      case "rectify": return NextResponse.json(await rectify(id, op.email, ids, b.changes ?? {}))
      case "restrict": return NextResponse.json(await restrict(id, op.email, ids))
      case "refuse": await refuse(id, op.email, String(b.reason ?? "")); return NextResponse.json({ ok: true })
      case "extend": await extend(id, op.email, Number(b.days), String(b.reason ?? "")); return NextResponse.json({ ok: true })
      case "erase": return NextResponse.json(await erase(id, op.email))
      default: return NextResponse.json({ error: "Unknown action." }, { status: 400 })
    }
  } catch (e) { return fail(e) }
}
function fail(e: unknown) {
  if (e instanceof DsarError) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error("[privacy-requests]", (e as Error)?.message)
  return NextResponse.json({ error: "The action failed. Nothing was changed that cannot be repeated." }, { status: 500 })
}
