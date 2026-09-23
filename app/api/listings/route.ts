/**
 * Listing opt-ins (docs/architecture/15).
 *
 * GET  → this workspace's company and fund listing state, with the reason
 *        either one cannot be listed yet.
 * POST { kind: "company" | "fund", listed: boolean }
 *
 * Founder workspaces control the company listing, fund workspaces the fund
 * listing; both need write access, and every change is audited.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireWorkspace, workspaceError, WorkspaceError } from "@/lib/auth/workspace-context"
import { auditContext } from "@/lib/audit/record-change"
import { getCompanyListing, getFundListing, setCompanyListing, setFundListing, ListingError } from "@/lib/platform/listings"

export const runtime = "nodejs"

export async function GET() {
  try {
    const scope = await requireWorkspace()
    const [company, fund] = await Promise.all([
      scope.persona === "founder" ? getCompanyListing(scope) : Promise.resolve(null),
      scope.persona === "vc" ? getFundListing(scope) : Promise.resolve(null),
    ])
    return NextResponse.json({ persona: scope.persona, company, fund })
  } catch (e) { return workspaceError(e) }
}

export async function POST(req: NextRequest) {
  try {
    const scope = await requireWorkspace(true)
    const body = await req.json().catch(() => null)
    const listed = body?.listed === true
    const ctx = auditContext(req, { id: scope.userId })

    if (body?.kind === "company") {
      if (scope.persona !== "founder") throw new WorkspaceError("Switch to your company workspace to change this listing.", 403)
      return NextResponse.json({ ok: true, company: await setCompanyListing(scope, listed, ctx) })
    }
    if (body?.kind === "fund") {
      if (scope.persona !== "vc") throw new WorkspaceError("Switch to your fund workspace to change this listing.", 403)
      return NextResponse.json({ ok: true, fund: await setFundListing(scope, listed, ctx) })
    }
    throw new WorkspaceError("Choose what to list: company or fund.", 400)
  } catch (e) {
    if (e instanceof ListingError) return NextResponse.json({ error: e.message }, { status: e.status })
    return workspaceError(e)
  }
}
