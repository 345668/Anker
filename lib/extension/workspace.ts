import { NextResponse } from "next/server"
import { getMemberships } from "@/lib/org/active"
import { corsHeaders } from "@/lib/extension/auth"
export async function extensionWorkspace(req: Request, userId: string, write = false) {
  const all = (await getMemberships(userId)).filter(m => m.persona === (m.kind === "company" ? "founder" : "vc"))
  const requested = req.headers.get("x-anker-workspace") || new URL(req.url).searchParams.get("workspaceId")
  const selected = requested ? all.find(m => m.orgId === requested) : all.length === 1 ? all[0] : null
  if (!selected) return NextResponse.json({error:"Choose a workspace for this extension request using X-Anker-Workspace.",workspaces:all.map(m=>({id:m.orgId,name:m.name}))},{status:409,headers:corsHeaders()})
  if (write && !["workspace_owner","admin","member"].includes(selected.orgRole)) return NextResponse.json({error:"This workspace is read only."},{status:403,headers:corsHeaders()})
  return selected
}
