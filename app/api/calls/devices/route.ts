import { NextRequest } from "next/server"
import { sql } from "@/lib/db"
import { callResponse, callScope, readCallBody } from "@/lib/calls/access"
import { createDevice } from "@/lib/calls/devices"
export async function GET() {
  return callResponse(async () => {
    const s = await callScope()
    return { devices: await sql`SELECT id, name, created_at, expires_at, last_seen_at, revoked_at FROM call_sync_devices WHERE user_id = ${s.userId} AND org_id = ${s.orgId} ORDER BY created_at DESC LIMIT 100` }
  })
}
export async function POST(req: NextRequest) {
  return callResponse(async () => {
    const scope = await callScope(true)
    const body = await readCallBody(req)
    return createDevice(scope, typeof body.name === "string" ? body.name : "")
  })
}
export async function DELETE(req: NextRequest) {
  return callResponse(async () => {
    const scope = await callScope(true)
    const body = await readCallBody(req)
    await sql`UPDATE call_sync_devices SET revoked_at = now() WHERE id = ${String(body.id)} AND user_id = ${scope.userId} AND org_id = ${scope.orgId}`
    return { ok: true }
  })
}
