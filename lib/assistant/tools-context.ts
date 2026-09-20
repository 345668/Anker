import { sql } from "@/lib/db"
import { requireAiPrincipal } from "./principal"
import type { ToolDef } from "./tools"
import { runwaySchema, capTableSchema, projectRunway, calculateCapTable } from "@/lib/planning/models"
import { getLpCapitalCalls, getLpDistributions, listDocumentsForLp } from "@/lib/portfolio/data-room"
export const CONTEXT_TOOLS: Record<string, ToolDef> = {
  planning_snapshot: {
    name:"planning_snapshot", description:"Read the founder's saved runway or cap table in this workspace and compute with the platform engine. No demo defaults or unsaved assumptions.", params:'{"tool":"runway"|"cap-table"}',
    async run(input) {
      const p=await requireAiPrincipal()
      if (p.persona!=="founder" || !p.orgId) throw new Error("Select a founder workspace.")
      const [row]=await sql`SELECT state,revision,updated_at FROM planning_scenarios WHERE user_id=${p.userId} AND org_id=${p.orgId} AND tool=${input.tool}`
      if (!row) return {observation:`No saved ${input.tool} scenario. Save inputs on /dashboard/${input.tool} first.`}
      const state=typeof row.state==="string"?JSON.parse(row.state):row.state
      const result=input.tool==="runway"?projectRunway(runwaySchema.parse(state)):calculateCapTable(capTableSchema.parse(state))
      return {observation:JSON.stringify({source:`/dashboard/${input.tool}`,revision:row.revision,updatedAt:row.updated_at,assumptions:state,result})}
    },
  },
  call_intelligence: {
    name:"call_intelligence",description:"Read recent analyzed calls belonging to this user and workspace, including objections, next steps and unsent follow-up drafts. Does not send or change records.",params:'{"callId"?:string}',
    async run(input) {
      const p=await requireAiPrincipal()
      if (!p.orgId || p.persona==="lp") throw new Error("Select a company or fund workspace.")
      const id=input.callId ?? null
      const rows=await sql`SELECT id,title,investor_name,occurred_at,status,summary,objections,next_steps,draft_followup FROM investor_calls
        WHERE user_id=${p.userId} AND org_id=${p.orgId} AND deleted_at IS NULL AND (${id}::text IS NULL OR id=${id})
        ORDER BY occurred_at DESC NULLS LAST LIMIT 10`
      return {observation:JSON.stringify({source:"/dashboard/calls",calls:rows,note:"Missing analysis is unavailable, not evidence of no objections. Follow-ups are drafts."})}
    },
  },
  lp_overview: {
    name:"lp_overview",description:"Read this LP's memberships, addressed capital notices and available document metadata. Never combines different currencies or returns another LP's account.",params:'{}',
    async run() {
      const p=await requireAiPrincipal()
      if(p.persona!=="lp")throw new Error("Select an investor workspace.")
      const ids=p.lpMemberships.map(m=>m.fund_lp_id)
      const [calls,distributions,documents]=await Promise.all([getLpCapitalCalls(ids),getLpDistributions(ids),listDocumentsForLp(p.lpMemberships,{limit:30})])
      return {observation:JSON.stringify({accounts:p.lpMemberships,capitalCalls:calls,distributions,documents:documents.map(d=>({id:d.id,title:d.title,category:d.category})),source:"/lp",note:"Document bodies and NAV are not included. Do not infer investment performance or document contents."})}
    },
  },
}
