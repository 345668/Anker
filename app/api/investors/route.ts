/** Compatibility wrapper: the people view of the caller's default lens. See /api/discovery. */
import { NextRequest, NextResponse } from "next/server"
import { workspaceError } from "@/lib/auth/workspace-context"
import { discoveryScope } from "@/lib/platform/discovery-scope"
import { parseDiscoveryParams, searchDiscovery, DiscoveryError } from "@/lib/platform/discovery"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const scope = await discoveryScope()
    const params = new URLSearchParams(request.nextUrl.searchParams)
    params.set("kind", "investors")
    const result = await searchDiscovery(scope, parseDiscoveryParams(params, scope.persona))
    return NextResponse.json({ investors: result.rows, pagination: { page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages, hasMore: result.hasMore }, facets: result.facets })
  } catch (e) {
    if (e instanceof DiscoveryError) return NextResponse.json({ error: "Invalid filter or pagination" }, { status: 400 })
    return workspaceError(e)
  }
}
