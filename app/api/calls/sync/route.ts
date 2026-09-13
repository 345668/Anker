import { NextRequest } from "next/server"
import { callResponse, CallError, readCallBody } from "@/lib/calls/access"
import { authenticateDevice } from "@/lib/calls/devices"
import { saveCall } from "@/lib/calls/records"
import { rateLimit } from "@/lib/rate-limit"
export const runtime = "nodejs"
export async function GET(req: NextRequest) {
  return callResponse(async () => {
    const scope = await authenticateDevice(req.headers.get("authorization"))
    return { scope, permissions: ["calls:upload"], analysis: "Review and request analysis in Anker. No automatic provider processing." }
  })
}
export async function POST(req: NextRequest) {
  return callResponse(async () => {
    const scope = await authenticateDevice(req.headers.get("authorization"))
    if (!rateLimit(`call-sync:${scope.userId}`, { limit: 30, windowMs: 60000 }).ok) throw new CallError("Sync rate limit reached. Retry in a minute.", 429)
    return saveCall(scope, await readCallBody(req), "desktop")
  })
}
