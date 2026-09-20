import { NextResponse } from "next/server"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { getAiStatus } from "@/lib/ai/provider"
import { canUseTool } from "@/lib/assistant/policy"
import { TOOL_SCHEMAS } from "@/lib/assistant/tool-schemas"
import { workspaceError } from "@/lib/auth/workspace-context"
export const dynamic="force-dynamic"
export async function GET() {
  try {
    const p=await requireAiPrincipal(),status=await getAiStatus()
    return NextResponse.json({providerActive:status.active,providerInfo:{model:status.model},scopeKey:p.scopeKey,persona:p.persona,tools:Object.keys(TOOL_SCHEMAS).filter(name=>canUseTool(p,name))},{headers:{"Cache-Control":"private, no-store"}})
  } catch(e) {return workspaceError(e)}
}
