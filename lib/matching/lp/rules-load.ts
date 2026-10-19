/** Loads what lp/rules.ts needs for one workspace run (docs/architecture/63 section 4.2). Read-only. */
import { sql } from "@/lib/db"
import { gateOn } from "@/lib/directory/sources"
import type { SourceRow } from "@/lib/directory/use-gate"
import { emptyRuleData, normName, type LpRuleData } from "./rules"

type Row = Record<string, any>
const safe = async <T,>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p } catch { return fallback } }

export async function loadLpRuleData(scope: { orgId: string; userId: string }, opts: { excludedJurisdictions?: string[]; includeKnown?: boolean } = {}): Promise<LpRuleData> {
  const data = emptyRuleData()
  data.includeKnown = !!opts.includeKnown
  for (const c of opts.excludedJurisdictions ?? []) if (c.trim()) data.excludedCountries.add(c.trim().toUpperCase())

  const crm = await safe(sql`SELECT firm_id, investor_id, stage FROM crm_entries WHERE org_id = ${scope.orgId}`, [] as Row[])
  for (const r of crm as Row[]) {
    // "queued" is a list the workspace has not started on: shown, not hidden. Anything further is contact already made.
    if (r.stage === "queued") continue
    const reason = r.stage === "passed" ? "declined" : "inCrm"
    for (const k of [r.firm_id && `firm:${r.firm_id}`, r.investor_id && `contact:${r.investor_id}`].filter(Boolean) as string[]) {
      if (data.keys.get(k) !== "declined") data.keys.set(k, reason)
    }
  }
  const saved = await safe(sql`SELECT entity_key FROM founder_match_exclusions WHERE org_id = ${scope.orgId}`, [] as Row[])
  for (const r of saved as Row[]) data.keys.set(String(r.entity_key), "saved")

  const supp = await safe(sql`SELECT lower(email) AS email FROM email_suppressions WHERE user_id = ${scope.userId} OR user_id IS NULL`, [] as Row[])
  for (const r of supp as Row[]) if (r.email) data.emails.add(String(r.email))

  // Investors the fund already has (doc 60 records), by address and by name.
  const mine = await safe(sql`SELECT lower(l.contact_email) AS email, l.lp_name FROM fund_lps l JOIN organizations o ON o.fund_id = l.fund_id WHERE o.id = ${scope.orgId}`, [] as Row[])
  for (const r of mine as Row[]) { if (r.email) data.yoursEmails.add(String(r.email)); const n = normName(r.lp_name); if (n) data.yoursNames.add(n) }

  const src = await safe(sql`SELECT source, status, permitted_use FROM directory_sources`, [] as Row[])
  for (const r of src as Row[]) data.sources.set(String(r.source), { source: r.source, status: r.status, permitted_use: r.permitted_use ?? [] } as SourceRow)
  data.gateOn = await gateOn()
  return data
}
