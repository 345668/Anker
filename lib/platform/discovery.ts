import { sql } from "@/lib/db"

export interface DiscoveryFacets { countries: string[]; sectors: string[]; stages: string[]; types: string[] }

const FACET_FIELDS = {
  countries: ["investor_country", "hq_location", "location"],
  sectors: ["sectors", "industries", "industry", "investment_focus"],
  stages: ["stages", "funding_stage"],
  types: ["investor_type", "type", "firm_classification"],
} as const

/** Menu ranges are inclusive overlaps; a single amount means a point in a range. */
export function checkSizeRange(input: string): { min: number; max: number | null } {
  const amount = (value: string) => {
    const match = value.trim().match(/^\$?([\d]+(?:\.[\d]+)?)([KMB])?$/i)
    if (!match) throw new Error("Invalid check size")
    const n = Number(match[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase() as "K"] ?? 1)
    if (!Number.isFinite(n)) throw new Error("Invalid check size")
    return n
  }
  const value = input.trim()
  if (value.endsWith("+")) return { min: amount(value.slice(0, -1)), max: null }
  const parts = value.split(/[-–]/)
  if (parts.length > 2) throw new Error("Invalid check size")
  const min = amount(parts[0]), max = parts.length === 2 ? amount(parts[1]) : min
  if (max < min) throw new Error("Invalid check size")
  return { min, max }
}

// All identifiers come from the fixed catalog above; user values are bound.
function facetValues(keys: readonly string[]) {
  return keys.map(key => `SELECT BTRIM(value) value FROM jsonb_array_elements_text(
    CASE jsonb_typeof(j->'${key}')
      WHEN 'array' THEN j->'${key}'
      WHEN 'string' THEN to_jsonb(regexp_split_to_array(j->>'${key}', '[,;|]'))
      ELSE '[]'::jsonb END) value`).join(" UNION ALL ")
}

export function discoveryQuery(kind: "investors" | "firms", params: URLSearchParams) {
  const page = Number(params.get("page") ?? 1), limit = Number(params.get("limit") ?? 100)
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500 || !Number.isSafeInteger((page - 1) * limit)) throw new Error("Invalid pagination")
  const values: unknown[] = []
  const bind = (value: unknown) => { values.push(value); return `$${values.length}` }
  const where: string[] = []
  const search = params.get("search")?.trim()
  if (search) where.push(`CONCAT_WS(' ', j->>'name', j->>'first_name', j->>'last_name', j->>'firm_name', j->>'title', j->>'email', j->>'description', j->>'bio') ILIKE ${bind("%" + search.replace(/[\\%_]/g, "\\$&") + "%")}`)
  for (const [param, facet] of [["sector", "sectors"], ["stage", "stages"], ["type", "types"], ["country", "countries"]] as const) {
    const value = params.get(param)?.trim()
    if (value && !value.startsWith("All ")) {
      where.push(`EXISTS (SELECT 1 FROM (${facetValues(FACET_FIELDS[facet])}) options WHERE LOWER(value) = LOWER(${bind(value)}))`)
    }
  }
  if (params.get("hasEmail") === "true") where.push(`NULLIF(BTRIM(COALESCE(NULLIF(BTRIM(j->>'email'), ''), j->'emails'->>0)), '') IS NOT NULL`)
  if (params.get("hasLinkedIn") === "true") where.push(`NULLIF(BTRIM(COALESCE(NULLIF(BTRIM(j->>'linkedin_url'), ''), j->>'person_linkedin_url')), '') IS NOT NULL`)
  const check = params.get("check")
  if (check && check !== "All Sizes") {
    const range = checkSizeRange(check)
    const number = (key: string) => `CASE WHEN j->>'${key}' ~ '^[0-9]+([.][0-9]+)?$' THEN (j->>'${key}')::numeric END`
    const low = number("check_size_min"), high = number("check_size_max")
    where.push(`(${low}) <= (${high})`, `(${high}) >= ${bind(range.min)}`)
    if (range.max !== null) where.push(`(${low}) <= ${bind(range.max)}`)
  }
  const source = kind === "investors"
    ? `SELECT to_jsonb(t) || jsonb_build_object('firm_name', COALESCE(NULLIF(to_jsonb(t)->>'firm_name', ''), f.name)) j
       FROM investors t LEFT JOIN investment_firms f ON f.id::text = to_jsonb(t)->>'firm_id'
       WHERE COALESCE(to_jsonb(t)->>'is_active', 'true') <> 'false'`
    : "SELECT to_jsonb(t) j FROM investment_firms t"
  const order = `COALESCE(NULLIF(j->>'name', ''), CONCAT_WS(' ', j->>'last_name', j->>'first_name')), j->>'id'`
  const l = bind(limit), o = bind((page - 1) * limit)
  const facets = Object.entries(FACET_FIELDS).map(([name, keys]) =>
    `'${name}', COALESCE((SELECT jsonb_agg(value ORDER BY value) FROM (
      SELECT DISTINCT value FROM source CROSS JOIN LATERAL (${facetValues(keys)}) options
      WHERE value <> ''
    ) choices), '[]'::jsonb)`).join(",")
  const query = `WITH source AS (${source}), filtered AS (
    SELECT j FROM source WHERE ${where.length ? where.join(" AND ") : "true"}
  ), page_rows AS (SELECT j FROM filtered ORDER BY ${order} LIMIT ${l} OFFSET ${o})
  SELECT (SELECT COUNT(*)::int FROM filtered) total,
    COALESCE((SELECT jsonb_agg(j) FROM page_rows), '[]'::jsonb) rows,
    jsonb_build_object(${facets}) facets`
  return { query, values, page, limit }
}

export async function searchDiscovery(kind: "investors" | "firms", params: URLSearchParams) {
  const { query, values, page, limit } = discoveryQuery(kind, params)
  const [result] = await sql.unsafe(query, values)
  const total = Number(result.total)
  return { [kind]: result.rows, facets: result.facets as DiscoveryFacets, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total } }
}
