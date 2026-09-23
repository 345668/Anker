/**
 * POST /api/email-verification  { emails: string[] (≤ 200) }
 *
 * Verify investor addresses on demand — before saving to the CRM or exporting
 * (docs/architecture/13 §5). Founder and fund workspaces only; the provider
 * stage counts against the platform's daily budget.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireWorkspace, WorkspaceError } from "@/lib/auth/workspace-context"
import { verifyEmails } from "@/lib/email-verification/service"
import { statusLabel } from "@/lib/email-verification/types"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const scope = await requireWorkspace()
    if (!["founder", "vc"].includes(scope.persona)) return NextResponse.json({ error: "Switch to a company or fund workspace." }, { status: 403 })
    const body = await req.json().catch(() => null)
    const emails: unknown = body?.emails
    if (!Array.isArray(emails) || !emails.every((e) => typeof e === "string") || emails.length > 200) {
      return NextResponse.json({ error: "Send up to 200 email addresses." }, { status: 400 })
    }
    const report = await verifyEmails(emails as string[], { providerLimit: emails.length })
    return NextResponse.json({
      results: [...report.results.values()].map((v) => ({ email: v.email, status: v.status, label: statusLabel(v.status), reason: v.reason, provider: v.provider, checkedAt: v.checkedAt })),
      providerConfigured: report.providerConfigured,
      budgetLeft: report.budgetLeft,
    })
  } catch (e) {
    if (e instanceof WorkspaceError) return NextResponse.json({ error: e.message }, { status: e.status })
    console.error("[email-verification]", e)
    return NextResponse.json({ error: "Verification is temporarily unavailable." }, { status: 503 })
  }
}
