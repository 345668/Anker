import { NextRequest } from "next/server"
import { CallError, callResponse, callScope, readCallBody } from "@/lib/calls/access"
import { createCallFollowup } from "@/lib/calls/records"
export const runtime = "nodejs"
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return callResponse(async () => {
    const scope = await callScope(true)
    const body = await readCallBody(req)
    if (body.reviewed !== true || typeof body.editedDraft !== "string") throw new CallError("Review the follow-up text before creating a draft.")
    return createCallFollowup(scope, (await params).id, body.editedDraft)
  })
}
