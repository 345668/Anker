import { NextRequest, NextResponse } from "next/server"
import { halyardContext, halyardFailure } from "@/lib/halyard/route"
import { exportPersonalData } from "@/lib/halyard/personal-export"

export const runtime = "nodejs"
export const maxDuration = 60
/** Everything Halyard holds about the signed-in person's own calls in this workspace, as JSON (?id= for one call). Never blocked by the kill switch: your data is yours. */
export async function GET(req: NextRequest) {
  try {
    const c = await halyardContext(false), data = await exportPersonalData(c.orgId, c.userId, req.nextUrl.searchParams.get("id") ?? undefined)
    return new NextResponse(JSON.stringify(data, null, 2), { headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="halyard-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" } })
  } catch (e) { return halyardFailure(e) }
}
