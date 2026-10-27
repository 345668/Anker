import { NextRequest, NextResponse } from "next/server"
import { halyardContext, halyardWho, halyardFailure } from "@/lib/halyard/route"
import { getSettings, saveSettings, HalyardError } from "@/lib/halyard/sessions"

export const runtime = "nodejs"
/** Any member can read the workspace's Halyard settings (the start screen needs them); only an owner or admin changes them. */
export async function GET() { try { const c = await halyardContext(false), w = await halyardWho(false); return NextResponse.json({ ...(await getSettings(c.orgId)), canEdit: ["workspace_owner", "admin"].includes(String(w.role)) }) } catch (e) { return halyardFailure(e) } }
/** { retentionMonths: 1..120, requireInformed: boolean } */
export async function PUT(req: NextRequest) {
  try {
    const c = await halyardContext(true), w = await halyardWho(true)
    if (!["workspace_owner", "admin"].includes(String(w.role))) throw new HalyardError("Only a workspace owner or admin can change these settings.", 403, "role")
    return NextResponse.json(await saveSettings(c.orgId, await req.json()))
  } catch (e) { return halyardFailure(e) }
}
