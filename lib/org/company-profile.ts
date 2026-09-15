import { STARTUP_STAGES } from "@/lib/matching/v2/founder-types"

export type CompanyProfileSource = { name: string; settings: { profile?: Record<string, unknown> } }
const text = (value: unknown) => typeof value === "string" ? value : ""

/** Business facts can prefill a reviewed matching draft; free-text money never
 * becomes a numeric amount or silently changes currency. */
export function companyMatchingDefaults(workspace: CompanyProfileSource) {
  const profile = workspace.settings.profile ?? {}
  const sectors = Array.isArray(profile.sectors) ? profile.sectors.filter((s): s is string => typeof s === "string") : []
  const stage = text(profile.stage).toLowerCase()
  return {
    name: workspace.name, oneLiner: text(profile.summary).slice(0, 1000),
    sectorsCsv: sectors.join(", "), location: text(profile.geography),
    stage: (STARTUP_STAGES as readonly string[]).includes(stage) ? stage : "",
  }
}
export function missingCompanyDetails(workspace: CompanyProfileSource) {
  const profile = workspace.settings.profile ?? {}
  return [
    ["Company summary", !!text(profile.summary).trim()],
    ["Stage", !!text(profile.stage).trim()],
    ["Sectors", Array.isArray(profile.sectors) && profile.sectors.some(s => typeof s === "string" && s.trim())],
    ["Location", !!text(profile.geography).trim()],
  ].filter(([, present]) => !present).map(([label]) => String(label))
}
