/**
 * Discover — the directory behind each persona's lens (docs/architecture/12, 14 §9).
 *
 * What changed from v1, and why (doc 10 §7):
 *   • explicit column projection per kind — v1 sent every column, including
 *     the 1,024-number embedding, phone, address, user_id and Folk fields
 *     (1.46 MB per 100 rows);
 *   • filters run on the normalised, indexed columns (norm_country,
 *     norm_sectors, norm_stages, norm_class, check_min/max), so the
 *     check-size filter works for people and a country means a country;
 *   • facets come from the materialised `discovery_facets` table instead of
 *     scanning the whole table on every request (40 s first page);
 *   • rows carry the workspace's CRM status and, for founders, the fit score
 *     from their latest matching run — the two tools finally share a scale.
 */
import { sql } from "@/lib/db"
import { LENSES, isLensFor, type Kind, type LensId, type Persona } from "./discovery-lenses"
import { similarFirms, similarInvestors } from "@/lib/ai/semantic-search"

export interface DiscoveryFacet { value: string; label: string; n: number }
export interface DiscoveryFacets { country: DiscoveryFacet[]; region: DiscoveryFacet[]; sector: DiscoveryFacet[]; stage: DiscoveryFacet[]; class: DiscoveryFacet[] }

export interface DiscoveryQuery {
  lens: LensId
  kind: Kind
  page: number
  limit: number
  search: string | null
  sector: string | null
  stage: string | null
  investorClass: string | null
  country: string | null
  region: string | null
  check: string | null
  hasEmail: boolean
  hasLinkedIn: boolean
  hideSaved: boolean
  sort: "name" | "fit" | "updated"
}

export class DiscoveryError extends Error {}

/** Menu ranges are inclusive overlaps; a single amount means a point in a range. */
export function checkSizeRange(input: string): { min: number; max: number | null } {
  const amount = (value: string) => {
    const match = value.trim().match(/^\$?([\d]+(?:\.[\d]+)?)([KMB])?$/i)
    if (!match) throw new DiscoveryError("Invalid check size")
    const n = Number(match[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase() as "K"] ?? 1)
    if (!Number.isFinite(n)) throw new DiscoveryError("Invalid check size")
    return n
  }
  const value = input.trim()
  if (value.endsWith("+")) return { min: amount(value.slice(0, -1)), max: null }
  const parts = value.split(/[-–]/)
  if (parts.length > 2) throw new DiscoveryError("Invalid check size")
  const min = amount(parts[0]), max = parts.length === 2 ? amount(parts[1]) : min
  if (max < min) throw new DiscoveryError("Invalid check size")
  return { min, max }
}

const ident = (v: string | null, max = 60) => (v && v.length <= max && /^[\w .&/'-]+$/.test(v) ? v : null)

export function parseDiscoveryParams(params: URLSearchParams, persona: Persona): DiscoveryQuery {
  const lensParam = params.get("lens") ?? ""
  const lens: LensId = isLensFor(lensParam, persona) ? lensParam : (Object.keys(LENSES) as LensId[]).find((id) => LENSES[id].persona === persona)!
  const kindParam = params.get("kind") as Kind | null
  const kind = kindParam && LENSES[lens].kinds.includes(kindParam) ? kindParam : LENSES[lens].kinds[0]
  const page = Number(params.get("page") ?? 1), limit = Number(params.get("limit") ?? 50)
  if (!Number.isSafeInteger(page) || page < 1 || page > 500 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new DiscoveryError("Invalid pagination")
  }
  const sortParam = params.get("sort")
  const clean = (v: string | null) => (v && !v.startsWith("All ") ? v : null)
  return {
    lens, kind, page, limit,
    search: (params.get("search") ?? "").trim().slice(0, 120) || null,
    sector: ident(clean(params.get("sector"))),
    stage: ident(clean(params.get("stage"))),
    investorClass: ident(clean(params.get("class"))),
    country: ident(clean(params.get("country")), 4),
    region: ident(clean(params.get("region"))),
    check: clean(params.get("check")),
    hasEmail: params.get("hasEmail") === "true",
    hasLinkedIn: params.get("hasLinkedIn") === "true",
    hideSaved: params.get("hideSaved") === "true",
    sort: sortParam === "fit" || sortParam === "updated" ? sortParam : "name",
  }
}

/**
 * Columns each kind exposes. Nothing else leaves the server: no phone, no
 * address, no embedding, no metadata, no Folk fields, no owner ids
 * (doc 12 §4). Held by a test on the payload keys.
 */
const PROJECTION: Record<Kind, string> = {
  firms: `t.id::text AS id, t.name, COALESCE(t.firm_classification, t.type) AS type, t.norm_class,
          left(t.description, 600) AS description, t.website, t.linkedin_url AS linkedin,
          COALESCE(t.hq_location, t.location) AS location, t.norm_country, t.norm_region, t.norm_sectors, t.norm_stages,
          t.check_min, t.check_max, t.aum, t.portfolio_count, t.updated_at,
          NULLIF(btrim(COALESCE(t.emails->>0, '')), '') AS email`,
  investors: `t.id::text AS id, concat_ws(' ', t.first_name, t.last_name) AS name, t.title, t.firm_id::text AS firm_id,
          f.name AS firm_name, t.investor_type AS type, t.norm_class, t.location, t.norm_country, t.norm_region,
          t.norm_sectors, t.norm_stages, t.check_min, t.check_max, left(t.bio, 600) AS description,
          COALESCE(t.linkedin_url, t.person_linkedin_url) AS linkedin, t.website, t.email, v.status AS email_status, t.updated_at`,
  startups: `t.id::text AS id, t.name, t.tagline AS description, t.stage, t.industries AS sectors, t.location,
          t.website, t.linkedin_url AS linkedin, t.founder_linkedin, COALESCE(t.target_amount, 0) AS target_amount,
          t.funding_target, t.updated_at`,
  funds: `t.id::text AS id, t.name, t.description, t.vintage_year, t.target_size, t.currency, t.status,
          t.vehicle_kind, t.manager_org, t.updated_at`,
}

const SEARCH_COLUMNS: Record<Kind, string> = {
  firms: "concat_ws(' ', t.name, t.description, t.industry)",
  investors: "concat_ws(' ', t.first_name, t.last_name, t.title, f.name, t.bio)",
  startups: "concat_ws(' ', t.name, t.tagline, t.description, t.location)",
  funds: "concat_ws(' ', t.name, t.description)",
}

export interface DiscoveryScope { orgId: string | null; persona: Persona; userId?: string | null }

export async function facetsFor(lens: LensId, kind: Kind): Promise<DiscoveryFacets> {
  const rows = await sql`SELECT facet, value, label, n FROM discovery_facets WHERE lens = ${lens} AND kind = ${kind} ORDER BY n DESC`
  const out: DiscoveryFacets = { country: [], region: [], sector: [], stage: [], class: [] }
  for (const r of rows as any[]) (out as any)[r.facet]?.push({ value: r.value, label: r.label, n: Number(r.n) })
  return out
}

/** The workspace's most recent founder run, whose scores power "fit". */
async function latestRunId(orgId: string | null): Promise<string | null> {
  if (!orgId) return null
  const [r] = await sql`SELECT id FROM founder_match_runs WHERE org_id = ${orgId} AND expires_at > now() ORDER BY created_at DESC LIMIT 1`
  return r?.id ?? null
}

export async function searchDiscovery(scope: DiscoveryScope, q: DiscoveryQuery) {
  const lens = LENSES[q.lens]
  const values: unknown[] = []
  const bind = (v: unknown) => { values.push(v); return `$${values.length}` }
  const where: string[] = []
  const table = q.kind === "firms" ? "investment_firms" : q.kind === "investors" ? "investors" : q.kind === "startups" ? "startups" : "funds"

  // Base population for the lens.
  if (q.kind === "investors") where.push("COALESCE(t.is_active, true)")
  if (q.kind === "startups") where.push("COALESCE(t.is_public, false)")
  if (q.kind === "funds") where.push("COALESCE(t.listed_for_lps, false)")
  if (lens.classes && (q.kind === "firms" || q.kind === "investors")) where.push(`t.norm_class = ANY(${bind(lens.classes)})`)

  // Filters on normalised columns.
  if (q.sector) where.push(`t.norm_sectors @> ARRAY[${bind(q.sector)}]::text[]`)
  if (q.stage) where.push(`t.norm_stages @> ARRAY[${bind(q.stage)}]::text[]`)
  if (q.investorClass) where.push(`t.norm_class = ${bind(q.investorClass)}`)
  if (q.country) where.push(`t.norm_country = ${bind(q.country)}`)
  if (q.region) where.push(`t.norm_region = ${bind(q.region)}`)
  if (q.check && (q.kind === "firms" || q.kind === "investors")) {
    const range = checkSizeRange(q.check)
    where.push(`COALESCE(t.check_max, t.check_min) >= ${bind(range.min)}`)
    if (range.max !== null) where.push(`COALESCE(t.check_min, t.check_max) <= ${bind(range.max)}`)
  }
  if (q.hasEmail) where.push(q.kind === "investors" ? "NULLIF(btrim(t.email), '') IS NOT NULL" : "NULLIF(btrim(COALESCE(t.emails->>0, '')), '') IS NOT NULL")
  if (q.hasLinkedIn) where.push(q.kind === "investors" ? "COALESCE(t.linkedin_url, t.person_linkedin_url) IS NOT NULL" : "t.linkedin_url IS NOT NULL")

  // Search: semantic for a phrase when the directory is embedded, else text.
  let semanticIds: string[] | null = null
  if (q.search && (q.kind === "firms" || q.kind === "investors") && q.search.trim().split(/\s+/).length >= 2) {
    const hits = q.kind === "firms" ? await similarFirms(q.search, 200) : await similarInvestors(q.search, 200)
    if (hits.length) semanticIds = hits.map((h) => String(h.row.id))
  }
  if (semanticIds) where.push(`t.id::text = ANY(${bind(semanticIds)})`)
  else if (q.search) where.push(`${SEARCH_COLUMNS[q.kind]} ILIKE ${bind("%" + q.search.replace(/[\\%_]/g, "\\$&") + "%")}`)

  const joins: string[] = []
  if (q.kind === "investors") {
    joins.push("LEFT JOIN investment_firms f ON f.id::text = t.firm_id::text")
    joins.push("LEFT JOIN email_verifications v ON v.email = lower(btrim(t.email)) AND v.expires_at > now()")
  }

  // CRM status and fit, for workspaces that have them.
  let crmSelect = "NULL::text AS crm_stage", fitSelect = "NULL::real AS fit_score, NULL::int AS fit_rank"
  if (scope.orgId && (q.kind === "firms" || q.kind === "investors")) {
    const org = bind(scope.orgId)
    const match = q.kind === "firms" ? `c.firm_id = t.id::text AND c.investor_id IS NULL` : `c.investor_id = t.id::text`
    joins.push(`LEFT JOIN LATERAL (SELECT stage FROM crm_entries c WHERE c.org_id = ${org} AND ${match} LIMIT 1) crm ON true`)
    crmSelect = "crm.stage AS crm_stage"
    if (q.hideSaved) where.push("crm.stage IS NULL")
    const runId = await latestRunId(scope.orgId)
    if (runId) {
      const run = bind(runId)
      const on = q.kind === "firms"
        ? `r.run_id = ${run} AND r.kind = 'group' AND r.entity_id = t.id::text`
        : `r.run_id = ${run} AND ((r.kind = 'independent' AND r.entity_id = t.id::text) OR (r.kind = 'group' AND r.firm_id = t.firm_id::text))`
      joins.push(`LEFT JOIN LATERAL (SELECT max(r.score) AS score, min(r.rank) AS rank FROM founder_match_results r WHERE ${on}) fit ON true`)
      fitSelect = "fit.score AS fit_score, fit.rank AS fit_rank"
    }
  }

  // People rows have no name column; every ordering falls back to the same name expression.
  const nameOrder = q.kind === "investors" ? "concat_ws(' ', t.first_name, t.last_name)" : "t.name"
  const order = q.sort === "fit" && fitSelect.startsWith("fit.")
    ? `fit.score DESC NULLS LAST, ${nameOrder}, t.id::text`
    : q.sort === "updated" ? `t.updated_at DESC NULLS LAST, ${nameOrder}, t.id::text`
    : `${nameOrder}, t.id::text`

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : ""
  const joinSql = joins.join("\n")
  const [count] = await sql.unsafe(`SELECT count(*)::int AS n FROM ${table} t ${joinSql} ${whereSql}`, values)
  const limit = bind(q.limit), offset = bind((q.page - 1) * q.limit)
  const rows = await sql.unsafe(
    `SELECT ${PROJECTION[q.kind]}, ${crmSelect}, ${fitSelect}
       FROM ${table} t ${joinSql} ${whereSql}
      ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, values)

  const total = Number(count?.n ?? 0)
  return {
    rows: rows as Record<string, unknown>[],
    total,
    page: q.page,
    limit: q.limit,
    totalPages: Math.max(1, Math.ceil(total / q.limit)),
    hasMore: q.page * q.limit < total,
    searchMode: semanticIds ? ("semantic" as const) : q.search ? ("text" as const) : null,
    facets: await facetsFor(q.lens, q.kind),
  }
}
