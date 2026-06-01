/**
 * POST /api/admin/email-check
 *   Body either:
 *     { email: string }                             — single
 *     { emails: string[], concurrency?: number }    — list
 *     { source: "investors", limit?: number }       — pull from DB
 *
 * Returns: { results: EmailCheckResult[], summary, hunterAvailable }
 *
 * Admin-gated.
 */
import { NextRequest, NextResponse } from "next/server"
import { sql } from "@/lib/db"
import { requireAdmin } from "@/lib/auth/require-admin"
import {
  bulkCheck,
  checkEmail,
  summarizeVerdicts,
  type EmailCheckResult,
} from "@/lib/admin/email-check"
import { isHunterAvailable } from "@/lib/admin/hunter"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  try {
    const body = await req.json()

    if (typeof body?.email === "string" && body.email.trim()) {
      const r = await checkEmail(body.email, { timeoutMs: Number(body.timeoutMs) || 12_000 })
      return NextResponse.json({
        results: [r], summary: summarizeVerdicts([r]),
        hunterAvailable: isHunterAvailable(),
      })
    }

    let emails: string[] = []
    let owners: { id: string; field: string; firmId?: string | null }[] = []
    if (Array.isArray(body?.emails) && body.emails.length) {
      emails = body.emails.map((s: any) => String(s))
    } else if (body?.source === "investors") {
      const limit = Math.max(1, Math.min(1000, Number(body.limit) || 100))
      const rows = await sql`
        SELECT id, email, firm_id FROM investors
        WHERE email IS NOT NULL AND email <> ''
        ORDER BY updated_at ASC NULLS FIRST LIMIT ${limit}
      `
      emails = (rows as any[]).map((r) => r.email)
      owners = (rows as any[]).map((r) => ({ id: r.id, field: "email", firmId: r.firm_id ?? null }))
    } else {
      return NextResponse.json({ error: "Provide `email`, `emails`, or `source: 'investors'`." }, { status: 400 })
    }

    const results: EmailCheckResult[] = await bulkCheck(emails, {
      concurrency: Number(body.concurrency) || 4,
      timeoutMs: Number(body.timeoutMs) || 12_000,
    })
    const summary = summarizeVerdicts(results)
    const owned = owners.length === results.length
      ? results.map((r, i) => ({ ...r, owner: owners[i] }))
      : results
    return NextResponse.json({ results: owned, summary, hunterAvailable: isHunterAvailable() })
  } catch (e: any) {
    console.error("[admin/email-check] error:", e)
    return NextResponse.json({ error: e?.message ?? "email-check failed" }, { status: 500 })
  }
}
