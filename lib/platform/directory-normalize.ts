/**
 * Directory normalisation (docs/architecture/14 §9).
 *
 * Writes the shared vocabulary (lib/matching/normalize) into indexed columns
 * on investment_firms and investors — country, region, sector groups, stages,
 * investor class, check range — so Discover filters on the same meaning the
 * matching engine scores on, and never scans raw JSON per request. Then
 * rebuilds the facet table the Discover filters read.
 *
 * Incremental: rows whose normalized_at is missing or older than updated_at.
 */
import { sql } from "@/lib/db"
import { resolveGeo, countryName, REGION_LABELS } from "@/lib/matching/normalize/geo"
import { sectorProfile, sectorLabel } from "@/lib/matching/normalize/sectors"
import { normalizeStages } from "@/lib/matching/normalize/stages"
import { investorClass, CLASS_LABELS } from "@/lib/matching/normalize/classes"
import { checkRange } from "@/lib/matching/normalize/money"
import { LENSES, type LensId } from "./discovery-lenses"

export interface NormalizedFields {
  norm_country: string | null
  norm_region: string | null
  norm_sectors: string[]
  norm_stages: string[]
  norm_class: string
  check_min: number | null
  check_max: number | null
}

export function normalizeFirm(r: any): NormalizedFields {
  const geo = resolveGeo(r.hq_location, r.location)
  const range = checkRange(r.check_size_min, r.check_size_max, r.typical_check_size)
  return {
    norm_country: geo.country, norm_region: geo.region,
    norm_sectors: sectorProfile([...toArr(r.sectors), ...toArr(r.industry)]).groups,
    norm_stages: normalizeStages(r.stages),
    norm_class: investorClass(r.firm_classification, r.type),
    check_min: range?.min ?? null, check_max: range?.max ?? null,
  }
}

export function normalizeInvestor(r: any): NormalizedFields {
  const geo = resolveGeo(r.investor_country, r.location, r.hq_location)
  const range = checkRange(null, null, r.typical_investment, r.typical_check_size)
  return {
    norm_country: geo.country, norm_region: geo.region,
    norm_sectors: sectorProfile(r.sectors).groups,
    norm_stages: normalizeStages([...toArr(r.stages), ...toArr(r.funding_stage)]),
    norm_class: investorClass(r.investor_type),
    check_min: range?.min ?? null, check_max: range?.max ?? null,
  }
}

function toArr(v: unknown): unknown[] {
  if (v == null || v === "") return []
  return Array.isArray(v) ? v : [v]
}

async function writeBatch(table: "investment_firms" | "investors", rows: (NormalizedFields & { id: string })[]) {
  if (!rows.length) return
  // jsonb_to_recordset types each field, including text[] from JSON arrays.
  await sql.unsafe(
    `UPDATE ${table} t SET
        norm_country = x.norm_country, norm_region = x.norm_region, norm_sectors = x.norm_sectors,
        norm_stages = x.norm_stages, norm_class = x.norm_class, check_min = x.check_min, check_max = x.check_max,
        normalized_at = now()
       FROM jsonb_to_recordset($1::jsonb) AS x(id text, norm_country text, norm_region text, norm_sectors text[],
            norm_stages text[], norm_class text, check_min numeric, check_max numeric)
      WHERE t.id::text = x.id`,
    [JSON.stringify(rows)],
  )
}

/** Normalise up to `limit` stale rows per table. Returns how many were written. */
export async function normalizeDirectory(limit = 5000, batch = 1000): Promise<{ firms: number; investors: number }> {
  const firms = await sql.unsafe(
    `SELECT id::text AS id, hq_location, location, sectors, industry, stages, firm_classification, type,
            check_size_min, check_size_max, typical_check_size
       FROM investment_firms
      WHERE normalized_at IS NULL OR (updated_at IS NOT NULL AND updated_at > normalized_at)
      LIMIT $1`, [limit])
  for (let i = 0; i < firms.length; i += batch) {
    await writeBatch("investment_firms", firms.slice(i, i + batch).map((r: any) => ({ id: r.id, ...normalizeFirm(r) })))
  }
  const people = await sql.unsafe(
    `SELECT id::text AS id, investor_country, location, hq_location, sectors, stages, funding_stage, investor_type,
            typical_investment, typical_check_size
       FROM investors
      WHERE normalized_at IS NULL OR (updated_at IS NOT NULL AND updated_at > normalized_at)
      LIMIT $1`, [limit])
  for (let i = 0; i < people.length; i += batch) {
    await writeBatch("investors", people.slice(i, i + batch).map((r: any) => ({ id: r.id, ...normalizeInvestor(r) })))
  }
  return { firms: firms.length, investors: people.length }
}

const STAGE_LABELS: Record<string, string> = {
  "pre-seed": "Pre-seed", seed: "Seed", "series-a": "Series A", "series-b": "Series B",
  "series-c": "Series C+", growth: "Growth", "late-stage": "Late stage",
}

/** Rebuild the facet table for every lens (doc 12 §6). */
export async function rebuildFacets(): Promise<number> {
  const rows: { lens: string; kind: string; facet: string; value: string; label: string; n: number }[] = []
  for (const [lensId, lens] of Object.entries(LENSES) as [LensId, (typeof LENSES)[LensId]][]) {
    for (const kind of lens.kinds) {
      if (kind === "startups" || kind === "funds") continue
      const table = kind === "firms" ? "investment_firms" : "investors"
      const classes = lens.classes
      const where = classes ? `WHERE norm_class = ANY($1)` : ""
      const params = classes ? [classes] : []
      const q = async (expr: string) => (await sql.unsafe(
        `SELECT v AS value, count(*)::int AS n FROM (SELECT ${expr} AS v FROM ${table} ${where}) s WHERE v IS NOT NULL AND v <> '' GROUP BY 1 ORDER BY 2 DESC LIMIT 400`, params)) as any[]
      for (const r of await q("norm_country")) rows.push({ lens: lensId, kind, facet: "country", value: r.value, label: countryName(r.value) ?? r.value, n: r.n })
      for (const r of await q("norm_region")) rows.push({ lens: lensId, kind, facet: "region", value: r.value, label: REGION_LABELS[r.value as keyof typeof REGION_LABELS] ?? r.value, n: r.n })
      for (const r of await q("unnest(norm_sectors)")) rows.push({ lens: lensId, kind, facet: "sector", value: r.value, label: sectorLabel(r.value), n: r.n })
      for (const r of await q("unnest(norm_stages)")) rows.push({ lens: lensId, kind, facet: "stage", value: r.value, label: STAGE_LABELS[r.value] ?? r.value, n: r.n })
      for (const r of await q("norm_class")) rows.push({ lens: lensId, kind, facet: "class", value: r.value, label: CLASS_LABELS[r.value as keyof typeof CLASS_LABELS] ?? r.value, n: r.n })
    }
  }
  await sql`DELETE FROM discovery_facets`
  for (let i = 0; i < rows.length; i += 1000) {
    await sql.unsafe(
      `INSERT INTO discovery_facets (lens, kind, facet, value, label, n, refreshed_at)
       SELECT lens, kind, facet, value, label, n, now() FROM jsonb_to_recordset($1::jsonb)
         AS x(lens text, kind text, facet text, value text, label text, n integer)
       ON CONFLICT (lens, kind, facet, value) DO UPDATE SET label = EXCLUDED.label, n = EXCLUDED.n, refreshed_at = now()`,
      [JSON.stringify(rows.slice(i, i + 1000))],
    )
  }
  return rows.length
}
