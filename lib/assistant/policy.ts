import { toolAllowlistFor } from "@/lib/agents/presets"
import { TOOL_SCHEMAS } from "./tool-schemas"
import type { AiPrincipal } from "./context"

// These write to the SHARED investor directory (investment_firms, investors), which is not a tenant's data: a workspace member approving a change there would be editing every
// other workspace's records, and imports need provenance and a licence (docs 37 §8.2, 43 §2). They stay blocked for tenants; the owner console is their path.
// build_investor_profile is not here: it writes nothing (it reads a firm's site and public LinkedIn and synthesizes a profile), so it is an ordinary read tool whose run is marked untrusted.
const BLOCKED = new Set(["enrich_db_from_xlsx","enrich_firms"])
// Governed writes: these do not run, they become proposals a person decides (lib/actions, doc 43). Only a member who can write may propose.
const PROPOSE = new Set(["crm_update_stage","crm_add_task","memory_remember"])
const READ_ONLY = new Set(["web_search","web_crawl","query_investors","crm_overview","crm_search","memory_recall","deal_pipeline","network_intro_paths","outreach_inbox","fund_performance","planning_snapshot","call_intelligence","lp_overview","analyze_image","ocr_image","translate_text"])
const FUND_READS = new Set(["fund_performance","deal_pipeline","portfolio_kpi_rollup"])
export function canUseTool(p: AiPrincipal, name: string) {
  if (!toolAllowlistFor(p.persona).has(name) || !TOOL_SCHEMAS[name] || BLOCKED.has(name)) return false
  if (p.readonly && !READ_ONLY.has(name)) return false
  if (p.allowedTools && !p.allowedTools.includes(name)) return false
  if (FUND_READS.has(name) && (p.persona !== "vc" || !["workspace_owner","admin"].includes(p.membership?.orgRole ?? ""))) return false
  if (PROPOSE.has(name) && (p.readonly || !p.canWrite)) return false
  if (name === "send_outreach" && (p.readonly || !p.canWrite)) return false
  // Saves the startup profile and the run, so a read-only or non-writing member cannot run it.
  if (name === "match_investors" && (p.readonly || !p.canWrite)) return false
  return true
}
/** Validate the same bounded input contract advertised to MCP. */
export function validateToolInput(name: string, input: unknown) {
  const schema = TOOL_SCHEMAS[name]
  if (!schema) throw new Error("Tool input contract unavailable.")
  if ((JSON.stringify(input) ?? "").length > 200_000) throw new Error("Tool input is too large.")
  function check(value: any, rule: any, path: string, depth: number) {
    if (depth > 12) throw new Error("Tool input is too deeply nested.")
    const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value
    if (rule.type && !(Array.isArray(rule.type) ? rule.type : [rule.type]).includes(type)) throw new Error(`${path} has the wrong type.`)
    if (rule.enum && !rule.enum.includes(value)) throw new Error(`${path} has an unsupported value.`)
    if (type === "number" && (!Number.isFinite(value) || (rule.minimum != null && value < rule.minimum) || (rule.maximum != null && value > rule.maximum))) throw new Error(`${path} is outside the allowed range.`)
    if (type === "string" && value.length > 80_000) throw new Error(`${path} is too long.`)
    if (type === "array") {
      if (value.length > 500) throw new Error(`${path} has too many items.`)
      for (const item of value) check(item,rule.items ?? {},`${path}[]`,depth+1)
    }
    if (type === "object") {
      for (const key of rule.required ?? []) if (value[key] === undefined || value[key] === "") throw new Error(`${path}.${key} is required.`)
      for (const [key,item] of Object.entries(value)) {
        if (["__proto__","constructor","prototype"].includes(key)) throw new Error("Unsupported input key.")
        if (!rule.properties?.[key] && rule.additionalProperties === false) throw new Error(`${path}.${key} is not supported.`)
        check(item,rule.properties?.[key] ?? {},`${path}.${key}`,depth+1)
      }
    }
  }
  check(input,schema,name,0)
}
