import { NextResponse } from "next/server"
import { isAdminUser } from "@/lib/auth/require-admin"
import { listAuditEvents } from "@/lib/audit/audit-log"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const { isAdmin } = await isAdminUser()
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  const url = new URL(req.url)
  const { events, nextCursor } = await listAuditEvents({
    actor: url.searchParams.get("actor") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    targetType: url.searchParams.get("targetType") ?? undefined,
    before: url.searchParams.get("before") ?? undefined,
    limit: Number(url.searchParams.get("limit")) || 50,
  })
  return NextResponse.json({ events, nextCursor })
}
