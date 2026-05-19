/**
 * GET /api/admin/email/outbox?bucket=drafts|sent|needs_followup|failed|all&limit=N
 *
 * Admin-gated.  Returns rows + counts.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { listOutbox, outboxCounts, type EmailBucket } from "@/lib/admin/email-outbox"

export const runtime = "nodejs"

const VALID: EmailBucket[] = ["drafts", "sent", "needs_followup", "failed", "all"]

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const url = new URL(req.url)
    const bucket = (url.searchParams.get("bucket") ?? "drafts") as EmailBucket
    if (!VALID.includes(bucket)) {
      return NextResponse.json({ error: `Invalid bucket: ${bucket}` }, { status: 400 })
    }
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100))
    const [rows, counts] = await Promise.all([
      listOutbox({ bucket, limit }),
      outboxCounts(),
    ])
    return NextResponse.json({ rows, counts })
  } catch (e: any) {
    console.error("[admin/email/outbox GET]", e)
    return NextResponse.json({ error: e?.message ?? "Failed" }, { status: 500 })
  }
}
