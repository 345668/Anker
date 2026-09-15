import { z } from "zod"
import { STARTUP_STAGES } from "./v2/founder-types"

const text = z.string().trim().min(1)
const tags = z.array(text).max(50)
const amount = z.number().finite().nonnegative().max(1e13).nullable().optional()
export const runOptionsSchema = z.object({
  minScore: z.number().finite().min(0).max(150).optional(),
  maxFirms: z.number().int().min(1).max(10000).optional(),
  maxContacts: z.number().int().min(1).max(10000).optional(),
  enableAi: z.boolean().optional(),
})
export const startupSchema = z.object({
  id: z.string().optional(), name: text.max(200), stage: z.enum(STARTUP_STAGES),
  location: text.max(200), sectors: tags.min(1), primarySector: z.string().optional(),
  askAmount: z.number().finite().positive().max(1e13),
  preMoneyValuation: amount, checkSizeIdealMin: amount, checkSizeIdealMax: amount,
  arr: amount, mrr: amount, growthRateMom: z.number().finite().nullable().optional(),
  teamSize: z.number().int().nonnegative().nullable().optional(),
  foundedYear: z.number().int().min(1800).max(2200).nullable().optional(),
  thesisKeywords: tags.default([]), oneLiner: z.string().max(1000).optional(), description: z.string().max(10000).optional(),
}).superRefine((p, ctx) => {
  if (p.checkSizeIdealMin != null && p.checkSizeIdealMax != null && p.checkSizeIdealMin > p.checkSizeIdealMax)
    ctx.addIssue({ code: "custom", path: ["checkSizeIdealMax"], message: "Maximum check must be at least the minimum check" })
})
export const fundDraftSchema = z.object({
  id: z.string().max(200).optional(), name: text.max(200),
  targetRaise: amount, averageTicket: amount, avgCheckSize: amount, hardCap: amount, minimumCommitment: amount,
  fundNumber: z.number().int().positive().nullable().optional(),
  managementFee: z.number().min(0).max(100).nullable().optional(), carry: z.number().min(0).max(100).nullable().optional(),
  gpCommitment: z.number().min(0).max(100).nullable().optional(),
  fundLife: amount, targetCompanies: amount, investmentPeriod: amount,
  investmentStage: z.string().max(500).nullable().optional(),
  sectors: tags.default([]), primarySectors: tags.default([]), geographicFocus: tags.default([]), targetLpTypes: tags.default([]),
  headquartersLocation: z.string().max(200).nullable().optional(), thesisKeywords: tags.default([]),
  thesisDescription: z.string().max(10000).nullable().optional(), valueProposition: z.string().max(10000).nullable().optional(),
  gpName: z.string().max(1000).nullable().optional(), portfolioCompanies: tags.default([]),
}).superRefine((p, ctx) => {
  if (p.hardCap != null && p.targetRaise != null && p.hardCap < p.targetRaise)
    ctx.addIssue({ code: "custom", path: ["hardCap"], message: "Hard cap must be at least the target raise" })
  if (p.minimumCommitment != null && p.averageTicket != null && p.minimumCommitment > p.averageTicket)
    ctx.addIssue({ code: "custom", path: ["averageTicket"], message: "Average LP ticket must be at least the minimum commitment" })
})

export type ReadinessIssue = { field: string; label: string }
export function startupReadiness(profile: unknown): ReadinessIssue[] {
  const result = startupSchema.safeParse(profile)
  if (result.success) return []
  const labels: Record<string, string> = { name: "Startup name", stage: "Funding stage", sectors: "At least one sector", location: "Company location", askAmount: "Round size (greater than zero)", checkSizeIdealMax: "Valid maximum check", checkSizeIdealMin: "Valid minimum check" }
  return result.error.issues.map(i => ({ field: String(i.path[0]), label: labels[String(i.path[0])] ?? `Valid ${String(i.path[0])}` }))
}
export function fundReadiness(p: { name?: string; targetRaise?: number | null; sectors?: string[]; headquartersLocation?: string | null; geographicFocus?: string[] }): ReadinessIssue[] {
  const issues: ReadinessIssue[] = []
  if (!p.name?.trim()) issues.push({ field: "name", label: "Fund name" })
  if (!(Number.isFinite(p.targetRaise) && Number(p.targetRaise) > 0)) issues.push({ field: "targetRaise", label: "Target raise (greater than zero)" })
  if (!p.sectors?.some(s => s.trim())) issues.push({ field: "sectors", label: "At least one sector" })
  if (!p.headquartersLocation?.trim()) issues.push({ field: "headquartersLocation", label: "Fund headquarters" })
  if (!p.geographicFocus?.some(s => s.trim())) issues.push({ field: "geographicFocus", label: "Investment geography" })
  return issues
}

/** Extraction fills gaps only: zero is a value, and empty AI arrays are not evidence. */
export function fillEmpty<T extends object>(current: T, extracted: Partial<T>): T {
  const next = { ...current }
  for (const key of Object.keys(extracted) as (keyof T)[]) {
    const old = current[key], value = extracted[key]
    const empty = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0)
    if (empty(old) && !empty(value)) next[key] = value as T[keyof T]
  }
  return next
}

export async function responseError(response: Response, fallback: string) {
  const data = await response.json().catch(() => null)
  return typeof data?.error === "string" ? data.error : `${fallback} (${response.status}). Please retry.`
}
