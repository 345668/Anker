import { sql } from "@/lib/db"

export function discoveryQuery(kind: "investors" | "firms", params: URLSearchParams) {
  const page = Number(params.get("page") ?? 1), limit = Number(params.get("limit") ?? 100)
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) throw new Error("Invalid pagination")
  const values: unknown[] = []
  const bind = (value: unknown) => { values.push(value); return `$${values.length}` }
  const text = (key: string) => `COALESCE(j->>'${key}', '')`
  const field = (...keys: string[]) => keys.map(text).join(" || ' ' || ")
  const where: string[] = kind === "investors" ? ["COALESCE(j->>'is_active', 'true') <> 'false'"] : []
  const contains = (name: string, expression: string) => {
    const v = params.get(name)?.trim()
    if (v && !v.startsWith("All ")) where.push(`(${expression}) ILIKE ${bind(`%${v.replace(/[\\%_]/g, "\\$&")}%`)}`)
  }
  contains("search", field("name", "first_name", "last_name", "firm_name", "title", "email", "description"))
  contains("sector", field("sectors", "industries", "industry", "investment_focus"))
  contains("stage", field("stages", "funding_stage"))
  contains("type", field("investor_type", "type", "firm_classification"))
  contains("country", field("investor_country", "hq_location", "location"))
  if (params.get("hasEmail") === "true") where.push(`NULLIF(BTRIM(COALESCE(j->>'email', j->'emails'->>0)), '') IS NOT NULL`)
  if (params.get("hasLinkedIn") === "true") where.push(`NULLIF(BTRIM(COALESCE(NULLIF(j->>'linkedin_url',''), j->>'person_linkedin_url')), '') IS NOT NULL`)
  const check = params.get("check")
  if (check && check !== "All Sizes") {
    const match = check.match(/^\$?([\d.]+)([KMB])?\+?$/i)
    if (!match) throw new Error("Invalid check size")
    const threshold = Number(match[1]) * ({ K: 1e3, M: 1e6, B: 1e9 }[match[2]?.toUpperCase() as "K"] ?? 1)
    if (!Number.isFinite(threshold) || threshold < 0) throw new Error("Invalid check size")
    const n = bind(threshold)
    // Numeric source ranges only: unspecified/text-only ranges cannot be inferred reliably.
    where.push(`(CASE WHEN j->>'check_size_min' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (j->>'check_size_min')::numeric END) <= ${n}`)
    where.push(`(CASE WHEN j->>'check_size_max' ~ '^[0-9]+(\\.[0-9]+)?$' THEN (j->>'check_size_max')::numeric END) >= ${n}`)
  }
  const table = kind === "investors" ? "investors" : "investment_firms"
  const order = `COALESCE(j->>'name', CONCAT_WS(' ', j->>'last_name', j->>'first_name')), j->>'id'`
  const l = bind(limit), o = bind((page - 1) * limit)
  const query = `WITH source AS (SELECT to_jsonb(t) j FROM ${table} t), filtered AS (
    SELECT j FROM source WHERE ${where.length ? where.join(" AND ") : "true"}
  ), page_rows AS (SELECT j FROM filtered ORDER BY ${order} LIMIT ${l} OFFSET ${o})
  SELECT (SELECT COUNT(*)::int FROM filtered) total,
    COALESCE((SELECT jsonb_agg(j) FROM page_rows), '[]'::jsonb) rows,
    COALESCE((SELECT jsonb_agg(country ORDER BY country) FROM (
      SELECT DISTINCT NULLIF(BTRIM(COALESCE(j->>'investor_country', j->>'hq_location', j->>'location')), '') country FROM source
    ) countries WHERE country IS NOT NULL), '[]'::jsonb) countries`
  return { query, values, page, limit }
}

export async function searchDiscovery(kind: "investors" | "firms", params: URLSearchParams) {
  const { query, values, page, limit } = discoveryQuery(kind, params)
  const [result] = await sql.unsafe(query, values)
  const total = Number(result.total)
  return { [kind]: result.rows, facets: { countries: result.countries }, pagination: { page, limit, total, totalPages: Math.ceil(total / limit), hasMore: page * limit < total } }
}
