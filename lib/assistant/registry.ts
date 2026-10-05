import { TOOLS, type ToolDef } from "./tools"
import { FO_TOOLS } from "./tools-fo"
import { PLATFORM_TOOLS } from "./tools-platform"
import { MODELING_TOOLS } from "./tools-modeling"
import { CONTEXT_TOOLS } from "./tools-context"
import { canUseTool, validateToolInput } from "./policy"
import { checkAiBudget, currentRunId, markRunUntrusted, runIsUntrusted, type AiPrincipal } from "./context"
import { isProposeCapability } from "@/lib/actions/capabilities"
import { UNTRUSTED_SOURCES } from "@/lib/actions/model"
import { logEvent } from "@/lib/observability/log"
export const ALL_TOOLS: Record<string,ToolDef>={...TOOLS,...FO_TOOLS,...PLATFORM_TOOLS,...MODELING_TOOLS,...CONTEXT_TOOLS}
export function toolsFor(p:AiPrincipal) {return Object.fromEntries(Object.entries(ALL_TOOLS).filter(([name])=>canUseTool(p,name)))}
export async function executeTool(p:AiPrincipal,name:string,input:unknown,refs:Array<{id:string;base64:string}>=[]) {
  if(!canUseTool(p,name)||!ALL_TOOLS[name])throw new Error("Tool unavailable for this workspace role.")
  validateToolInput(name,input)
  checkAiBudget()
  function resolve(value:any):any {
    if(typeof value==="string")return value.replace(/<<((?:IMG|XLSX)\d+)>>/g,(_match,id)=>{
      const ref=refs.find(r=>r.id===id);if(!ref)throw new Error("Attachment reference unavailable. Upload it again.");return ref.base64
    })
    if(Array.isArray(value))return value.map(resolve)
    if(value && typeof value==="object")return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,resolve(v)]))
    return value
  }
  // Boundary lines for the run trace: a tool that never returns is named by its start line.
  const startedAt=Date.now(),runId=currentRunId()
  logEvent("tool.start",{tool:name},runId)
  try {
    // Attachments are strangers' content too; so is whatever a reading tool returns (marked after it runs, below).
    if(refs.length)markRunUntrusted()
    if(isProposeCapability(name)){
      // Not a write: a proposal, applied only by a person (or by an owner-enabled policy for trusted R0 work). doc 43.
      const {propose}=await import("@/lib/actions/store")
      if(!p.orgId)throw new Error("Select a workspace to propose changes.")
      const capInput=name==="memory_remember"?{...(input as any),entityId:(input as any)?.entryId}:input
      const r=await propose({orgId:p.orgId,userId:p.userId,persona:p.persona},name,capInput,{runId,trust:runIsUntrusted()?"untrusted":"trusted"})
      const note=r.applied?`Done (applied by your workspace's auto-apply setting): ${r.message??r.proposal.summary}`
        :`Proposed, not applied: ${r.proposal.summary}. It is waiting in the Actions inbox (/dashboard/actions) for a person to approve${r.proposal.risk_class==="R2"?" (approving sends real email, and only the sender can approve it)":""}${r.proposal.source_trust==="untrusted"?" (this run read outside content, so it always needs a person)":""}. Tell the user it is awaiting approval; do not say it was done.`
      logEvent("tool.end",{tool:name,ok:true,proposal:r.proposal.id,status:r.proposal.status,ms:Date.now()-startedAt,obs_chars:note.length},runId)
      return {observation:note}
    }
    const result=await ALL_TOOLS[name].run(resolve(input),{userId:p.userId})
    if(UNTRUSTED_SOURCES.has(name))markRunUntrusted()
    logEvent("tool.end",{tool:name,ok:true,ms:Date.now()-startedAt,obs_chars:result.observation?.length??0},runId)
    return result
  } catch(e:any) {
    logEvent("tool.end",{tool:name,ok:false,ms:Date.now()-startedAt,error:String(e?.message??e).slice(0,160)},runId)
    throw e
  }
}
