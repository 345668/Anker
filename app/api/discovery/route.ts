/**
 * GET /api/discovery — the directory through the caller's persona lens
 * (docs/architecture/12). Never returns a column the persona may not see.
 */
import { NextRequest, NextResponse } from "next/server"
import { workspaceError } from "@/lib/auth/workspace-context"
import { discoveryScope } from "@/lib/platform/discovery-scope"
import { parseDiscoveryParams, searchDiscovery, DiscoveryError } from "@/lib/platform/discovery"
import { LENSES, lensesFor } from "@/lib/platform/discovery-lenses"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const scope = await discoveryScope()
    const query = parseDiscoveryParams(req.nextUrl.searchParams, scope.persona)
    const result = await searchDiscovery(scope, query)
    return NextResponse.json({
      ...result,
      lens: query.lens,
      kind: query.kind,
      lenses: lensesFor(scope.persona).map((id) => ({ id, ...LENSES[id] })),
      persona: scope.persona,
    })
  } catch (e) {
    if (e instanceof DiscoveryError) return NextResponse.json({ error: "Invalid filter or pagination." }, { status: 400 })
    return workspaceError(e)
  }
}
