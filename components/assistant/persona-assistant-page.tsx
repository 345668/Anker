import { redirect } from "next/navigation"
import { requireAiPrincipal } from "@/lib/assistant/principal"
import { WorkspaceError } from "@/lib/auth/workspace-context"
import { canUseTool } from "@/lib/assistant/policy"
import { TOOL_SCHEMAS } from "@/lib/assistant/tool-schemas"
import { agentForPersona } from "@/lib/agents/personas"
import { AssistantPowerhouse } from "./assistant-powerhouse"
export async function PersonaAssistantPage() {
  let p
  try {p=await requireAiPrincipal()} catch(e) {
    if(e instanceof WorkspaceError && e.status===401) redirect("/auth/login")
    if(e instanceof WorkspaceError && e.status===403) return <main className="p-8"><h1 className="text-2xl font-semibold">Choose a workspace</h1><p className="my-4">{e.message}</p><a className="underline" href="/dashboard/discover">Set up or select a workspace</a></main>
    throw e
  }
  const agent=agentForPersona(p.persona)
  return <AssistantPowerhouse key={`${p.userId}:${p.scopeKey}:${p.persona}`} scopeKey={p.scopeKey} agentLabel={agent.label} agentTagline={agent.tagline} suggestions={agent.suggestions} allowedTools={Object.keys(TOOL_SCHEMAS).filter(name=>canUseTool(p,name))}/>
}
