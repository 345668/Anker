import { NextRequest, NextResponse } from "next/server"
import { halyardWho, halyardFailure } from "@/lib/halyard/route"
import { HalyardError } from "@/lib/halyard/sessions"
import { createPlaybook, listPlaybooks, shippedSkills, MAX_PERSONAL, MAX_WORKSPACE } from "@/lib/halyard/playbooks"

export const runtime = "nodejs"
/** The modes a person can pick: the built-in ones, their workspace's playbooks and their own. */
export async function GET() {
  try {
    const w = await halyardWho(false)
    return NextResponse.json({
      builtIn: shippedSkills().filter((s) => s.base === "call").sort((a, b) => a.order - b.order).map((s) => ({ mode: s.id, label: s.mode || s.title, description: s.description, prepHint: s.prepHint })),
      playbooks: await listPlaybooks(w.orgId, w.userId), canWriteWorkspace: ["workspace_owner", "admin"].includes(w.role), canWrite: w.role !== "viewer", limits: { workspace: MAX_WORKSPACE, personal: MAX_PERSONAL },
    })
  } catch (e) { return halyardFailure(e) }
}
/** { scope: "personal" | "workspace", text } — a new playbook, validated exactly like the built-in ones. */
export async function POST(req: NextRequest) {
  try {
    const w = await halyardWho(true)
    if (w.via === "device") throw new HalyardError("Write playbooks in the web app.", 403, "browser_only")
    const b = await req.json()
    return NextResponse.json({ playbook: await createPlaybook(w, { scope: b?.scope, text: b?.text }) }, { status: 201 })
  } catch (e) { return halyardFailure(e) }
}
