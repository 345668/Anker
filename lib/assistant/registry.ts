import { TOOLS, type ToolDef } from "./tools"
import { FO_TOOLS } from "./tools-fo"
import { PLATFORM_TOOLS } from "./tools-platform"
import { MODELING_TOOLS } from "./tools-modeling"
import { CONTEXT_TOOLS } from "./tools-context"
import { canUseTool, validateToolInput } from "./policy"
import { checkAiBudget, currentRunId, type AiPrincipal } from "./context"
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
    const result=await ALL_TOOLS[name].run(resolve(input),{userId:p.userId})
    logEvent("tool.end",{tool:name,ok:true,ms:Date.now()-startedAt,obs_chars:result.observation?.length??0},runId)
    return result
  } catch(e:any) {
    logEvent("tool.end",{tool:name,ok:false,ms:Date.now()-startedAt,error:String(e?.message??e).slice(0,160)},runId)
    throw e
  }
}
