/**
 * What a fund shows investors, and the rules for who may take part (docs/architecture/61 section 5, 64 B3).
 *
 * A fund is visible to investors only when its manager switches it on (`funds.listed_for_lps`, off for every fund) AND has set who may invest. What they see is a snapshot
 * taken from the fund and its manager's profile at the moment of listing or refreshing: a fixed list of fields, never documents, an LP list, performance or the CRM.
 */
import { sql } from "@/lib/db"
import { setFundListing, ListingError } from "@/lib/platform/listings"
import type { AuditContext } from "@/lib/audit/record-change"
import { CATEGORIES, type Category, type FundFacts, type Rules } from "./fit"
import { InvestorError } from "./profile"

export interface ListingRules extends Rules { dailyCap: number; ndaRequired: boolean; ndaText: string }
export const NDA_MAX = 20000
export const DEFAULT_RULES: ListingRules = { categories: [], countries: [], excludedCountries: [], minTicket: null, professionalOnly: false, dailyCap: 10, ndaRequired: false, ndaText: "" }

const code = (v: unknown) => String(v ?? "").trim().toUpperCase()
const codes = (v: unknown, field: string): string[] => {
  const out = [...new Set((Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\s]+/) : []).map(code).filter(Boolean))]
  if (out.some((c) => !/^[A-Z]{2}$/.test(c))) throw new InvestorError(`${field} takes two-letter country codes, such as DE or GB.`)
  return out.slice(0, 80)
}
/** Reads the rules a manager typed. Pure. */
export function readRules(raw: any): ListingRules {
  const categories = [...new Set((Array.isArray(raw?.categories) ? raw.categories : []).map(String))] as string[]
  if (categories.some((c) => !(CATEGORIES as readonly string[]).includes(c))) throw new InvestorError("Choose professional, semi-professional, other or not sure.")
  const minTicket = raw?.minTicket === null || raw?.minTicket === undefined || raw?.minTicket === "" ? null : Number(raw.minTicket)
  if (minTicket !== null && (!Number.isFinite(minTicket) || minTicket < 0 || minTicket > 1e12)) throw new InvestorError("The minimum cheque is an amount between 0 and 1,000,000,000,000.")
  const dailyCap = raw?.dailyCap === undefined || raw?.dailyCap === "" ? DEFAULT_RULES.dailyCap : Math.round(Number(raw.dailyCap))
  if (!Number.isFinite(dailyCap) || dailyCap < 1 || dailyCap > 100) throw new InvestorError("The daily limit on new requests is between 1 and 100.")
  const countries = codes(raw?.countries, "Countries that may invest"), excludedCountries = codes(raw?.excludedCountries, "Countries that may not invest")
  if (countries.some((c) => excludedCountries.includes(c))) throw new InvestorError("A country cannot be both allowed and excluded.")
  const ndaText = String(raw?.ndaText ?? "").replace(/\r\n/g, "\n").trim()
  if (ndaText.length > NDA_MAX) throw new InvestorError(`Keep the NDA text to ${NDA_MAX} characters.`)
  if (raw?.ndaRequired === true && !ndaText) throw new InvestorError("Paste the text of your NDA, or turn the NDA requirement off. Anker records that an investor accepted your text; it does not write one.")
  return { categories: categories as Category[], countries, excludedCountries, minTicket: minTicket === null ? null : Math.round(minTicket), professionalOnly: raw?.professionalOnly === true, dailyCap, ndaRequired: raw?.ndaRequired === true, ndaText }
}

/** The rules in the words an investor reads on the fund's page. */
export function whoMayInvest(r: ListingRules): string {
  const label: Record<string, string> = { professional: "professional investors", semi_professional: "semi-professional investors", other: "other investors", unsure: "investors unsure of their category" }
  const parts: string[] = []
  parts.push(r.professionalOnly ? "Professional investors only" : r.categories.length ? `Open to ${r.categories.map((c) => label[c]).join(", ")}` : "No restriction by investor category is stated")
  if (r.countries.length) parts.push(`from ${r.countries.join(", ")}`)
  if (r.excludedCountries.length) parts.push(`not from ${r.excludedCountries.join(", ")}`)
  if (r.minTicket) parts.push(`minimum ${r.minTicket.toLocaleString("en-US")}`)
  return parts.join(", ") + "."
}

export interface Snapshot {
  name: string; manager: string | null; description: string | null; strategy: string | null
  stages: string[]; sectors: string[]; geographies: string[]
  targetSize: number | null; currency: string | null; vintageYear: number | null; status: string | null
  minCommitment: number | null; termYears: number | null; vehicle: string | null; whoMayInvest: string
}
const asList = (v: any): string[] => (Array.isArray(v) ? v.map(String) : typeof v === "string" ? (() => { try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : [] } catch { return [] } })() : [])
const asObj = (v: any): any => (v && typeof v === "object" ? v : typeof v === "string" ? (() => { try { return JSON.parse(v) } catch { return {} } })() : {})
const num = (v: any): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v))
const clip = (v: any, n: number): string | null => { const s = String(v ?? "").replace(/\s+/g, " ").trim(); return s ? s.slice(0, n) : null }

/** The fund this workspace manages, and who manages it. */
export async function fundOfOrg(orgId: string): Promise<{ fundId: string; fundName: string; managerName: string | null } | null> {
  const [r] = (await sql`SELECT f.id, f.name AS fund_name, o.name AS manager FROM organizations o JOIN funds f ON f.id = o.fund_id WHERE o.id = ${orgId} LIMIT 1`) as any[]
  return r ? { fundId: String(r.id), fundName: r.fund_name, managerName: r.manager ?? null } : null
}

/** Takes the snapshot an investor will see, from the fund and its manager's active profile. */
export async function buildSnapshot(orgId: string, rules: ListingRules): Promise<Snapshot> {
  const [r] = (await sql`SELECT f.name, f.description, f.vintage_year, f.target_size, f.currency, f.status, f.vehicle_kind, o.name AS manager,
      p.sectors, p.geographic_focus, p.investment_stage, p.minimum_commitment, p.thesis_description, p.fund_life
    FROM organizations o JOIN funds f ON f.id = o.fund_id
    LEFT JOIN LATERAL (SELECT * FROM fund_profiles WHERE org_id = o.id AND is_active = true ORDER BY updated_at DESC NULLS LAST LIMIT 1) p ON true
    WHERE o.id = ${orgId} LIMIT 1`) as any[]
  if (!r) throw new InvestorError("This workspace does not manage a fund.", 404, "no_fund")
  return {
    name: String(r.name ?? ""), manager: clip(r.manager, 120), description: clip(r.description, 600), strategy: clip(r.thesis_description, 600),
    stages: String(r.investment_stage ?? "").split(/[,;/]/).map((s) => s.trim()).filter(Boolean).slice(0, 10), sectors: asList(r.sectors).slice(0, 20), geographies: asList(r.geographic_focus).slice(0, 20),
    targetSize: num(r.target_size), currency: clip(r.currency, 6), vintageYear: num(r.vintage_year), status: clip(r.status, 30),
    minCommitment: num(r.minimum_commitment), termYears: num(r.fund_life), vehicle: clip(r.vehicle_kind, 40), whoMayInvest: whoMayInvest(rules),
  }
}

export interface ListingState { fundId: string | null; name: string | null; listed: boolean; rules: ListingRules | null; snapshot: Snapshot | null; version: number; refreshedAt: string | null; blocked: string | null }
export async function getListingState(orgId: string): Promise<ListingState> {
  const f = await fundOfOrg(orgId)
  if (!f) return { fundId: null, name: null, listed: false, rules: null, snapshot: null, version: 0, refreshedAt: null, blocked: "This workspace does not manage a fund yet." }
  const [r] = (await sql`SELECT f.listed_for_lps, l.snapshot, l.eligibility, l.version, l.refreshed_at FROM funds f LEFT JOIN fund_listings l ON l.fund_id = f.id WHERE f.id = ${f.fundId}`) as any[]
  return { fundId: f.fundId, name: f.fundName, listed: !!r?.listed_for_lps, rules: r?.eligibility ? { ...DEFAULT_RULES, ...asObj(r.eligibility) } : null, snapshot: r?.snapshot ? asObj(r.snapshot) : null,
    version: Number(r?.version ?? 0), refreshedAt: r?.refreshed_at ? new Date(r.refreshed_at).toISOString() : null, blocked: f.fundName ? null : "Name the fund before listing it." }
}

/**
 * Saves who may invest and takes a fresh snapshot; with `listed` also switches the listing on or off. Listing needs the rules saved first, so a fund cannot go public with
 * rules nobody set, and needs enough in the snapshot to be worth reading (a focus: sectors or a strategy).
 */
export async function saveListing(scope: { orgId: string; userId: string }, input: { rules?: unknown; listed?: boolean }, ctx: AuditContext): Promise<ListingState> {
  const f = await fundOfOrg(scope.orgId)
  if (!f) throw new InvestorError("This workspace does not manage a fund.", 404, "no_fund")
  const cur = await getListingState(scope.orgId)
  const rules = input.rules !== undefined ? readRules(input.rules) : cur.rules
  if (!rules) throw new InvestorError("Set who may invest before listing the fund.", 422, "rules")
  const snapshot = await buildSnapshot(scope.orgId, rules)
  if (input.listed === true && !snapshot.sectors.length && !snapshot.strategy) throw new InvestorError("Add the fund's sectors or strategy to its fund profile before listing it: investors compare funds on what they state.", 422, "thin")
  await sql`INSERT INTO fund_listings (fund_id, snapshot, eligibility, version, refreshed_at, refreshed_by) VALUES (${f.fundId}, ${JSON.stringify(snapshot)}::jsonb, ${JSON.stringify(rules)}::jsonb, 1, now(), ${scope.userId})
    ON CONFLICT (fund_id) DO UPDATE SET snapshot = EXCLUDED.snapshot, eligibility = EXCLUDED.eligibility, version = fund_listings.version + 1, refreshed_at = now(), refreshed_by = EXCLUDED.refreshed_by`
  if (typeof input.listed === "boolean" && input.listed !== cur.listed) {
    try { await setFundListing({ orgId: scope.orgId, userId: scope.userId } as any, input.listed, ctx) } catch (e) { if (e instanceof ListingError) throw new InvestorError(e.message, e.status); throw e }
  }
  return getListingState(scope.orgId)
}

export interface ListedFund { facts: FundFacts; snapshot: Snapshot; rules: ListingRules; version: number }
const factsOf = (fundId: string, s: Snapshot, rules: ListingRules): FundFacts => ({
  fundId, name: s.name, status: s.status, sectors: s.sectors, stages: s.stages, geographies: s.geographies, minCommitment: s.minCommitment, termYears: s.termYears,
  rules: { categories: rules.categories, countries: rules.countries, excludedCountries: rules.excludedCountries, minTicket: rules.minTicket, professionalOnly: rules.professionalOnly },
})
/** Every fund that is switched on and has its rules and snapshot. */
export async function listedFunds(): Promise<ListedFund[]> {
  const rows = (await sql`SELECT f.id, l.snapshot, l.eligibility, l.version FROM funds f JOIN fund_listings l ON l.fund_id = f.id WHERE f.listed_for_lps = true ORDER BY f.name`) as any[]
  return rows.map((r) => { const s = asObj(r.snapshot) as Snapshot, rules = { ...DEFAULT_RULES, ...asObj(r.eligibility) } as ListingRules; return { facts: factsOf(String(r.id), s, rules), snapshot: s, rules, version: Number(r.version) } })
}
export async function listedFund(fundId: string): Promise<ListedFund | null> {
  return (await listedFunds()).find((f) => f.facts.fundId === fundId) ?? null
}
