/** What the shadow factors need from the database (docs/architecture/63 M6): the platform's settings for each factor, and the facts about the team's own relationships. Read-only. */
import { sql } from "@/lib/db"
import { normalizeFirmName } from "@/lib/matching/v2/dedup"
import { profileSlug } from "@/lib/compliance/suppression"
import { DEFAULT_SETTINGS, SHADOW_KEYS, emptyShadowContext, type FactorSettings, type ShadowContext, type ShadowKey } from "./shadow"

type Row = Record<string, any>
const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p } catch { return fallback } }

let cache: { at: number; settings: FactorSettings } | null = null
export const invalidateFactorSettings = () => { cache = null }

/** Each factor's status and weight, kept for half a minute. A factor missing from the table is in shadow at its default weight. */
export async function loadFactorSettings(now = Date.now()): Promise<FactorSettings> {
  if (cache && now - cache.at < 30_000) return cache.settings
  const out = JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as FactorSettings
  const rows = await safe(sql`SELECT key, status, weight FROM lp_scoring_factors`, [] as Row[])
  for (const r of rows as Row[]) if ((SHADOW_KEYS as readonly string[]).includes(r.key)) out[r.key as ShadowKey] = { status: r.status, weight: Number(r.weight) }
  cache = { at: now, settings: out }
  return out
}

export async function loadShadowContext(scope: { orgId: string }, fund: { fundNumber?: number; fundIPriorLpFirmIds?: string[]; fundIPriorContactEmails?: string[] }, now = Date.now()): Promise<ShadowContext> {
  const ctx = emptyShadowContext(now)
  ctx.fundNumber = fund.fundNumber ?? null
  for (const id of fund.fundIPriorLpFirmIds ?? []) if (id) ctx.priorLpFirmIds.add(String(id))
  for (const e of fund.fundIPriorContactEmails ?? []) if (e) ctx.priorContactEmails.add(String(e).trim().toLowerCase())

  const members = (await safe(sql`SELECT user_id::text AS id FROM memberships WHERE org_id = ${scope.orgId}`, [] as Row[])).map((r) => String(r.id))
  if (members.length) {
    const conns = await safe(sql`SELECT linkedin_url, company FROM linkedin_connections WHERE owner_id::text = ANY(${members}::text[]) AND degree = 1`, [] as Row[])
    if ((conns as Row[]).length) {
      ctx.connectionsByFirm = new Map(); ctx.connectionSlugs = new Set()
      for (const c of conns as Row[]) {
        const slug = profileSlug(c.linkedin_url); if (slug) ctx.connectionSlugs.add(slug)
        const firm = normalizeFirmName(c.company); if (firm) ctx.connectionsByFirm.set(firm, (ctx.connectionsByFirm.get(firm) ?? 0) + 1)
      }
      const mut = await safe(sql`SELECT person_url FROM linkedin_mutuals WHERE owner_id::text = ANY(${members}::text[])`, [] as Row[])
      ctx.mutualTargets = new Set((mut as Row[]).map((m) => profileSlug(m.person_url)).filter((s): s is string => !!s))
    }
  }
  const warm = await safe(sql`SELECT firm_id, investor_id FROM crm_entries WHERE org_id = ${scope.orgId} AND stage IN ('responded', 'meeting', 'in_diligence', 'committed')`, [] as Row[])
  for (const r of warm as Row[]) { if (r.firm_id) ctx.warmFirmIds.add(String(r.firm_id)); if (r.investor_id) ctx.warmInvestorIds.add(String(r.investor_id)) }
  return ctx
}
