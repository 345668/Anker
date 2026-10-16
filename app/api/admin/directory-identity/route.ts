/**
 * POST /api/admin/directory-identity — "run detection now", called by SAIL (docs/architecture/55, E1). Portal service principal only. Changes no directory data.
 */
import { NextResponse } from "next/server"
import { requireAdmin } from "@/lib/auth/require-admin"
import { runDetection } from "@/lib/directory/candidates"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function POST() {
  const guard = await requireAdmin()
  if (guard instanceof NextResponse) return guard
  if (guard.id !== "portal-service") return NextResponse.json({ error: "Only available through the staff portal." }, { status: 403 })
  try { return NextResponse.json(await runDetection()) } catch (e) { console.error("[directory-identity]", (e as Error).message); return NextResponse.json({ error: "Detection failed." }, { status: 500 }) }
}
