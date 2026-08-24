/**
 * POST /api/linkedin/actions/decision — approve or reject pending actions.
 *
 * This is the human approval gate (§4a). Approving flips 'pending_approval' →
 * 'queued' (the only state the extension can claim); rejecting → 'rejected'.
 * Both are no-ops on rows that aren't the caller's own pending actions.
 *
 * Body: { ids: string[], decision: "approve" | "reject", editedMessage?: string }
 *   editedMessage (approve only) overwrites payload.message before queuing —
 *   the "edit before approve" affordance.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireUser } from "@/lib/auth/require-user"
import { approveActions, rejectActions } from "@/lib/linkedin/action-queue"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: NextRequest) {
  const auth = await requireUser()
  if (auth instanceof NextResponse) return auth
  const body = await req.json().catch(() => ({}))

  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : []
  const decision = body.decision
  if (!ids.length) return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 })
  if (decision !== "approve" && decision !== "reject") {
    return NextResponse.json({ ok: false, error: "decision must be 'approve' or 'reject'" }, { status: 400 })
  }

  const editedMessage =
    typeof body.editedMessage === "string" && body.editedMessage.trim() ? body.editedMessage : undefined

  const affected =
    decision === "approve"
      ? await approveActions(auth.id, ids, auth.id, editedMessage)
      : await rejectActions(auth.id, ids)

  return NextResponse.json({ ok: true, decision, affected })
}
