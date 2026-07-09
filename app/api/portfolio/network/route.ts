/**
 * GET /api/portfolio/network
 *   Assembles the relationship graph (CRM contacts + LinkedIn captures).
 *   Query params:
 *     degrees=1,2,3        which network degrees to include
 *     edges=me,mutual,company,tag,deal   which edge types to compute
 *     warm=1               only CRM-matched nodes
     all=1                include CRM-only contacts (default: LinkedIn captures only)
 *     q=<search>           filter by name/company/title
 *     intro=<linkedinUrl>  instead of the graph, return intro paths for a person
 *
 * Admin-gated. LinkedIn captures are scoped to the signed-in admin's user id
 * (they're personal network data); contacts are org-wide like the rest of
 * the admin CRM surface.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { getNetworkGraph, getIntroPaths, type EdgeType } from "@/lib/portfolio/network-graph"

export const runtime = "nodejs"

const EDGE_TYPES: EdgeType[] = ["me", "mutual", "company", "tag", "deal"]

export async function GET(req: NextRequest) {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard

  const url = new URL(req.url)

  // Intro-path lookup mode (node drawer: "who can introduce me?").
  const intro = url.searchParams.get("intro")
  if (intro) {
    const paths = await getIntroPaths(guard.id, intro)
    return NextResponse.json({ paths })
  }

  const degrees = (url.searchParams.get("degrees") || "")
    .split(",")
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => n >= 1 && n <= 3)

  const edgeTypes = (url.searchParams.get("edges") || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is EdgeType => (EDGE_TYPES as string[]).includes(s))

  const graph = await getNetworkGraph(guard.id, {
    degrees: degrees.length ? degrees : undefined,
    edgeTypes: edgeTypes.length ? edgeTypes : undefined,
    warmOnly: url.searchParams.get("warm") === "1",
    linkedinOnly: url.searchParams.get("all") !== "1",
    q: url.searchParams.get("q"),
  })

  return NextResponse.json(graph)
}
