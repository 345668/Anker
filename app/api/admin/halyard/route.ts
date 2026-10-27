/**
 * Halyard supervision, called by SAIL (docs/architecture/62 section 15). Portal service principal only. Counts, timings and health per workspace; never any content of any call.
 *   GET -> { flagOn, health, totals, workspaces }
 * The kill switch is the platform flag halyard_web (SAIL, Flags) and a workspace's own switch is its `halyard` feature override (SAIL, the organisation page): both already audited there.
 */
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { halyardOverview } from "@/lib/halyard/supervision"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export async function GET() {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  if (g.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  try { return NextResponse.json(await halyardOverview()) } catch (e) { console.error("[admin/halyard]", (e as Error)?.message); return NextResponse.json({ error: "Halyard's tables could not be read." }, { status: 503 }) }
}
