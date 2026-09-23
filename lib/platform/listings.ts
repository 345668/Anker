/**
 * Listing opt-ins (docs/architecture/15).
 *
 * A company appears in the VC "Startups" lens, and a fund in the LP "Funds on
 * Anker" lens, only because that workspace switched it on. Both are off by
 * default, both switch off in one call, and the listing carries only the
 * fields below — never the deck, the CRM, the cap table or an LP list.
 */
import { sql } from "@/lib/db"
import { recordChange, type AuditContext } from "@/lib/audit/record-change"
import { latestProfile, type Scope } from "@/lib/matching/v2/founder-runs"

export class ListingError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Exactly what a listed company shows a fund manager. */
export const COMPANY_LISTING_FIELDS = [
  "name", "tagline", "stage", "industries", "location", "website", "founder_linkedin", "target_amount", "funding_target",
] as const

export interface CompanyListing {
  listed: boolean
  listedAt: string | null
  name: string | null
  tagline: string | null
  stage: string | null
  sectors: string[]
  location: string | null
  raising: number | null
  /** Why it cannot be listed yet, if it cannot. */
  blocked: string | null
}

function listingFromProfile(fields: Record<string, any>) {
  return {
    name: String(fields.name ?? "").slice(0, 200),
    tagline: (fields.oneLiner ?? fields.description ?? null)?.toString().slice(0, 300) ?? null,
    stage: fields.stage ?? null,
    industries: JSON.stringify(Array.isArray(fields.sectors) ? fields.sectors.slice(0, 12) : []),
    location: fields.location ?? null,
    website: fields.website ?? null,
    founder_linkedin: fields.founderLinkedin ?? null,
    target_amount: Number.isFinite(Number(fields.askAmount)) ? Math.round(Number(fields.askAmount)) : null,
    funding_target: fields.askAmount ? `$${Math.round(Number(fields.askAmount) / 1000)}K` : null,
  }
}

export async function getCompanyListing(scope: Scope): Promise<CompanyListing> {
  const [row] = await sql`SELECT id, name, tagline, stage, industries, location, target_amount, is_public, listed_at
                            FROM startups WHERE org_id = ${scope.orgId} ORDER BY listed_at DESC NULLS LAST LIMIT 1`
  const profile = await latestProfile(scope)
  const sectors = (() => {
    const raw = row?.industries
    if (Array.isArray(raw)) return raw as string[]
    try { const p = JSON.parse(String(raw ?? "[]")); return Array.isArray(p) ? p : [] } catch { return [] }
  })()
  return {
    listed: !!row?.is_public,
    listedAt: row?.listed_at ? new Date(row.listed_at).toISOString() : null,
    name: row?.name ?? profile?.fields?.name ?? null,
    tagline: row?.tagline ?? profile?.fields?.oneLiner ?? null,
    stage: row?.stage ?? profile?.fields?.stage ?? null,
    sectors: sectors.length ? sectors : (profile?.fields?.sectors ?? []),
    location: row?.location ?? profile?.fields?.location ?? null,
    raising: row?.target_amount ?? profile?.fields?.askAmount ?? null,
    blocked: profile?.fields?.name ? null : "Save your company profile on Find Investors first — the listing is built from it.",
  }
}

/**
 * Turn the listing on or off. Listing refreshes the projection from the
 * latest saved profile, so a founder never maintains two copies.
 */
export async function setCompanyListing(scope: Scope, listed: boolean, ctx: AuditContext): Promise<CompanyListing> {
  const [existing] = await sql`SELECT id, is_public FROM startups WHERE org_id = ${scope.orgId} ORDER BY listed_at DESC NULLS LAST LIMIT 1`
  const before = existing ? { is_public: !!existing.is_public } : null

  if (!listed) {
    if (!existing) return await getCompanyListing(scope)
    await sql`UPDATE startups SET is_public = false, updated_at = now() WHERE id = ${existing.id}`
  } else {
    const profile = await latestProfile(scope)
    if (!profile?.fields?.name) throw new ListingError("Save your company profile on Find Investors first — the listing is built from it.", 422)
    const p = listingFromProfile(profile.fields)
    if (existing) {
      await sql`UPDATE startups SET name = ${p.name}, tagline = ${p.tagline}, stage = ${p.stage},
                   industries = ${p.industries}::jsonb, location = ${p.location}, website = ${p.website},
                   founder_linkedin = ${p.founder_linkedin}, target_amount = ${p.target_amount}, funding_target = ${p.funding_target},
                   is_public = true, listed_at = now(), listed_by = ${scope.userId}, listing_source = 'startup_profile', updated_at = now()
                 WHERE id = ${existing.id}`
    } else {
      await sql`INSERT INTO startups (id, org_id, founder_id, name, tagline, stage, industries, location, website,
                   founder_linkedin, target_amount, funding_target, is_public, listed_at, listed_by, listing_source, created_at, updated_at)
                 VALUES (${crypto.randomUUID()}, ${scope.orgId}, ${scope.userId}, ${p.name}, ${p.tagline}, ${p.stage},
                   ${p.industries}::jsonb, ${p.location}, ${p.website}, ${p.founder_linkedin}, ${p.target_amount}, ${p.funding_target},
                   true, now(), ${scope.userId}, 'startup_profile', now(), now())`
    }
  }

  const after = await getCompanyListing(scope)
  await recordChange({
    ...ctx, scope: { type: "company", id: scope.orgId },
    action: listed ? "company_listing.listed" : "company_listing.unlisted",
    target: { type: "company_listing", id: scope.orgId, label: after.name },
    before, after: { is_public: listed },
    context: { visibleTo: "fund workspaces", fields: [...COMPANY_LISTING_FIELDS] },
  })
  return after
}

export interface FundListing {
  fundId: string | null
  name: string | null
  listed: boolean
  listedAt: string | null
  blocked: string | null
}

/** The fund this workspace manages, if it manages one. */
export async function getFundListing(scope: Scope): Promise<FundListing> {
  const [row] = await sql`
    SELECT f.id, f.name, f.listed_for_lps, f.listed_for_lps_at
      FROM organizations o JOIN funds f ON f.id = o.fund_id
     WHERE o.id = ${scope.orgId} LIMIT 1`
  if (!row) return { fundId: null, name: null, listed: false, listedAt: null, blocked: "This workspace does not manage a fund yet." }
  return {
    fundId: row.id, name: row.name ?? null, listed: !!row.listed_for_lps,
    listedAt: row.listed_for_lps_at ? new Date(row.listed_for_lps_at).toISOString() : null,
    blocked: row.name ? null : "Name the fund before listing it.",
  }
}

export async function setFundListing(scope: Scope, listed: boolean, ctx: AuditContext): Promise<FundListing> {
  const current = await getFundListing(scope)
  if (!current.fundId) throw new ListingError(current.blocked ?? "No fund in this workspace.", 404)
  if (listed && current.blocked) throw new ListingError(current.blocked, 422)
  // A bound parameter, not the string "now()", which Postgres cannot read as a timestamp.
  const listedAt = listed ? new Date().toISOString() : null
  await sql`UPDATE funds SET listed_for_lps = ${listed},
               listed_for_lps_at = ${listedAt}::timestamptz,
               listed_for_lps_by = ${listed ? scope.userId : null}, updated_at = now()
             WHERE id = ${current.fundId}`
  const after = await getFundListing(scope)
  await recordChange({
    ...ctx, scope: { type: "fund", id: current.fundId },
    action: listed ? "fund_listing.listed" : "fund_listing.unlisted",
    target: { type: "fund_listing", id: current.fundId, label: current.name },
    before: { listed_for_lps: current.listed }, after: { listed_for_lps: listed },
    context: { visibleTo: "LP portal", fields: ["name", "description", "vintage_year", "target_size", "currency", "status"] },
  })
  return after
}
