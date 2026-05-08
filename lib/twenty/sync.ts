/**
 * Anker ↔ Twenty CRM sync.
 *
 *   pushCrmEntry(id)   crm_entries → Twenty Company + Person + Opportunity
 *   pullCrmStages()    Twenty Opportunity.stage → crm_entries.stage
 *   syncAll()          push everything that's stale, then pull stages
 *
 * Mapping:
 *
 *   investment_firms        ↔ Twenty Company
 *   investors               ↔ Twenty Person
 *   crm_entries             ↔ Twenty Opportunity
 *
 *   crm_entries.stage       ↔ Opportunity.stage
 *     queued        → NEW
 *     contacted     → SCREENING
 *     responded     → MEETING
 *     meeting       → MEETING
 *     in_diligence  → PROPOSAL
 *     committed     → CUSTOMER
 *     passed        → CLOSED_LOST
 *
 *   The mapping is intentionally lossy in one direction (responded
 *   and meeting both map to Twenty's MEETING stage).  When pulling
 *   back, MEETING → meeting (always wins; user can manually drop
 *   back to responded if needed).
 */

import { sql } from "@/lib/db"
import {
  isTwentyConfigured,
  upsertCompany,
  upsertPerson,
  upsertOpportunity,
  readOpportunityStages,
  twentyUrl,
  type TwentyOpportunityStage,
} from "./client"

export type AnkerStage =
  | "queued" | "contacted" | "responded" | "meeting"
  | "in_diligence" | "committed" | "passed"

const ANKER_TO_TWENTY: Record<AnkerStage, TwentyOpportunityStage> = {
  queued: "NEW",
  contacted: "SCREENING",
  responded: "MEETING",
  meeting: "MEETING",
  in_diligence: "PROPOSAL",
  committed: "CUSTOMER",
  passed: "CLOSED_LOST",
}

const TWENTY_TO_ANKER: Record<TwentyOpportunityStage, AnkerStage> = {
  NEW: "queued",
  SCREENING: "contacted",
  MEETING: "meeting",
  PROPOSAL: "in_diligence",
  CUSTOMER: "committed",
  CLOSED_LOST: "passed",
}

export interface PushResult {
  ankerCrmEntryId: string
  twentyCompanyId: string | null
  twentyPersonId: string | null
  twentyOpportunityId: string | null
  twentyOpportunityUrl: string | null
  errors: string[]
  skipped?: boolean
}

export async function pushCrmEntry(crmEntryId: string): Promise<PushResult> {
  const result: PushResult = {
    ankerCrmEntryId: crmEntryId,
    twentyCompanyId: null,
    twentyPersonId: null,
    twentyOpportunityId: null,
    twentyOpportunityUrl: null,
    errors: [],
  }
  if (!isTwentyConfigured()) {
    result.skipped = true
    result.errors.push("Twenty not configured (TWENTY_BASE_URL + TWENTY_API_KEY).")
    return result
  }

  const [entry] = await sql`SELECT * FROM crm_entries WHERE id = ${crmEntryId} LIMIT 1`
  if (!entry) {
    result.errors.push("CRM entry not found")
    return result
  }
  const e = entry as any

  // 1. Company (firm) ─────────────────────────────────────────────────
  let companyId: string | null = null
  if (e.firm_id) {
    const [firm] = await sql`SELECT * FROM investment_firms WHERE id = ${e.firm_id} LIMIT 1`
    if (firm) {
      try {
        const c = await upsertCompany({
          name: (firm as any).name ?? e.display_name,
          domainName: cleanDomain((firm as any).website),
          city: parseCity((firm as any).hq_location ?? e.display_location),
          ankerFirmId: e.firm_id,
        })
        companyId = c.id || null
      } catch (err: any) {
        result.errors.push(`upsertCompany: ${err?.message ?? "failed"}`)
      }
    }
  }

  // 2. Person (investor) ──────────────────────────────────────────────
  let personId: string | null = null
  if (e.investor_id) {
    const [inv] = await sql`SELECT * FROM investors WHERE id = ${e.investor_id} LIMIT 1`
    const v = inv as any
    if (v) {
      try {
        const p = await upsertPerson({
          firstName: v.first_name ?? firstWord(e.display_name),
          lastName: v.last_name ?? rest(e.display_name),
          email: v.email ?? e.display_email ?? undefined,
          jobTitle: v.title ?? e.display_title ?? undefined,
          city: parseCity(v.location ?? e.display_location),
          linkedinUrl: v.linkedin_url ?? e.display_linkedin ?? undefined,
          companyId: companyId ?? undefined,
          ankerInvestorId: e.investor_id,
        })
        personId = p.id || null
      } catch (err: any) {
        result.errors.push(`upsertPerson: ${err?.message ?? "failed"}`)
      }
    }
  } else if (e.display_name) {
    // Fall back: synthesize a Person from display fields if there's no
    // linked investor row — Twenty still wants a point-of-contact.
    try {
      const p = await upsertPerson({
        firstName: firstWord(e.display_name),
        lastName: rest(e.display_name),
        email: e.display_email ?? undefined,
        jobTitle: e.display_title ?? undefined,
        city: parseCity(e.display_location),
        linkedinUrl: e.display_linkedin ?? undefined,
        companyId: companyId ?? undefined,
        ankerInvestorId: `crm:${e.id}`,
      })
      personId = p.id || null
    } catch (err: any) {
      result.errors.push(`upsertPerson(synth): ${err?.message ?? "failed"}`)
    }
  }

  // 3. Opportunity ─────────────────────────────────────────────────────
  try {
    const stage = ANKER_TO_TWENTY[(e.stage as AnkerStage) ?? "queued"] ?? "NEW"
    const o = await upsertOpportunity({
      name: e.display_name ?? `Lead ${e.id.slice(0, 8)}`,
      stage,
      amount: typeof e.display_score === "number" ? e.display_score : null,
      closeDate: null,
      companyId: companyId ?? undefined,
      pointOfContactId: personId ?? undefined,
      ankerCrmEntryId: e.id,
    })
    result.twentyOpportunityId = o.id || null
    result.twentyOpportunityUrl = o.id ? twentyUrl("opportunity", o.id) : null
  } catch (err: any) {
    result.errors.push(`upsertOpportunity: ${err?.message ?? "failed"}`)
  }

  result.twentyCompanyId = companyId
  result.twentyPersonId = personId
  return result
}

/** Pull Opportunity stages from Twenty and apply them to crm_entries.
 *  Forward-only — never auto-regress. */
export async function pullCrmStages(opts: { userId?: string; limit?: number } = {}): Promise<{
  pulled: number
  changes: { crmEntryId: string; from: AnkerStage; to: AnkerStage }[]
}> {
  if (!isTwentyConfigured()) return { pulled: 0, changes: [] }
  const cap = Math.max(1, Math.min(2000, opts.limit ?? 1000))
  const rows = opts.userId
    ? await sql`SELECT id, stage FROM crm_entries WHERE user_id = ${opts.userId} ORDER BY updated_at ASC LIMIT ${cap}`
    : await sql`SELECT id, stage FROM crm_entries ORDER BY updated_at ASC LIMIT ${cap}`
  const ids = (rows as any[]).map((r) => r.id)
  if (!ids.length) return { pulled: 0, changes: [] }
  const stages = await readOpportunityStages(ids)
  const stageMap = new Map(stages.map((s) => [s.ankerCrmEntryId, s.stage]))

  const changes: { crmEntryId: string; from: AnkerStage; to: AnkerStage }[] = []
  for (const r of rows as any[]) {
    const tStage = stageMap.get(r.id)
    if (!tStage) continue
    const target = TWENTY_TO_ANKER[tStage]
    if (!target || target === r.stage) continue
    // forward-only — same canAdvance logic as crm-sync.ts
    if (!canAdvance(r.stage, target)) continue
    await sql`UPDATE crm_entries SET stage = ${target}, updated_at = NOW() WHERE id = ${r.id}`
    changes.push({ crmEntryId: r.id, from: r.stage, to: target })
  }
  return { pulled: stages.length, changes }
}

const STAGE_ORDER: AnkerStage[] = [
  "queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed",
]
function canAdvance(from: AnkerStage, to: AnkerStage): boolean {
  if (to === "passed") return true
  return STAGE_ORDER.indexOf(to) >= STAGE_ORDER.indexOf(from)
}

// ─── Bulk push ──────────────────────────────────────────────────────────
export async function pushAll(opts: { userId?: string; limit?: number } = {}): Promise<{
  processed: number
  ok: number
  errors: number
}> {
  if (!isTwentyConfigured()) return { processed: 0, ok: 0, errors: 0 }
  const cap = Math.max(1, Math.min(1000, opts.limit ?? 200))
  const rows = opts.userId
    ? await sql`SELECT id FROM crm_entries WHERE user_id = ${opts.userId} ORDER BY updated_at DESC LIMIT ${cap}`
    : await sql`SELECT id FROM crm_entries ORDER BY updated_at DESC LIMIT ${cap}`
  let ok = 0, errors = 0
  for (const r of rows as any[]) {
    const res = await pushCrmEntry(r.id)
    if (res.errors.length === 0) ok++
    else errors++
  }
  return { processed: rows.length, ok, errors }
}

// ─── helpers ────────────────────────────────────────────────────────────
function firstWord(s?: string | null): string {
  if (!s) return ""
  return s.trim().split(/\s+/)[0] ?? ""
}
function rest(s?: string | null): string {
  if (!s) return ""
  const parts = s.trim().split(/\s+/)
  return parts.slice(1).join(" ")
}
function parseCity(loc?: string | null): string | undefined {
  if (!loc) return undefined
  return loc.split(",")[0]?.trim() || undefined
}
function cleanDomain(url?: string | null): string | undefined {
  if (!url) return undefined
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]
  }
}
