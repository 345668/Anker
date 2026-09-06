/**
 * Market Signals — a feed of investor activity, derived from the investor DB
 * (recency + sector + activity weight). Filtered to a founder's sector at read.
 * External live sources can add rows with source != 'derived' later.
 */
import "server-only"
import { sql } from "@/lib/db"

export interface Signal {
  id: string
  investor_id: string | null
  investor_name: string | null
  firm_name: string | null
  signal_type: string | null
  title: string
  detail: string | null
  sector: string | null
  stage: string | null
  location: string | null
  source: string | null
  score: number | null
  signal_at: string
}

/** (Re)derive the top-N active-investor signals from the investor DB. */
export async function refreshDerivedSignals(limit = 600): Promise<number> {
  await sql`DELETE FROM market_signals WHERE source = 'derived'`
  const rows = (await sql`
    INSERT INTO market_signals
      (investor_id, investor_name, signal_type, title, detail, sector, stage, location, source, score, signal_at, created_at)
    SELECT i.id,
      nullif(trim(coalesce(i.first_name,'') || ' ' || coalesce(i.last_name,'')), ''),
      'active',
      nullif(trim(coalesce(i.first_name,'') || ' ' || coalesce(i.last_name,'')), '')
        || ' is active in ' || (i.sectors->>0),
      nullif(concat_ws(' · ', nullif(i.investor_type,''), coalesce(i.hq_location, i.location),
        nullif(left(i.recent_investments, 140), '')), ''),
      i.sectors->>0,
      coalesce(nullif(i.funding_stage,''), i.preferred_stages->>0),
      coalesce(i.hq_location, i.location),
      'derived',
      coalesce(i.num_lead_investments, i.total_investments, 1),
      coalesce(i.updated_at, now()),
      now()
    FROM investors i
    WHERE i.is_active IS NOT FALSE
      AND jsonb_typeof(i.sectors) = 'array' AND jsonb_array_length(i.sectors) > 0
      AND (i.sectors->>0) IS NOT NULL
      AND trim(coalesce(i.first_name,'') || ' ' || coalesce(i.last_name,'')) <> ''
    ORDER BY i.updated_at DESC NULLS LAST
    LIMIT ${limit}
    RETURNING id
  `) as any[]
  return rows.length
}

/** Seed the feed on first read if it's empty. */
export async function ensureSeeded(): Promise<void> {
  const [c] = (await sql`SELECT count(*)::int n FROM market_signals`) as any[]
  if (!c || c.n === 0) await refreshDerivedSignals().catch(() => {})
}

/** Read the feed, ranked with an optional sector focus first. */
export async function getSignals(opts: { sector?: string | null; limit?: number } = {}): Promise<Signal[]> {
  const sector = opts.sector?.trim() || null
  const limit = Math.max(1, Math.min(100, opts.limit ?? 50))
  const rows = (await sql`
    SELECT * FROM market_signals
    WHERE (${sector}::text IS NULL OR lower(coalesce(sector,'')) LIKE '%' || lower(${sector}::text) || '%')
    ORDER BY
      CASE WHEN ${sector}::text IS NOT NULL AND lower(coalesce(sector,'')) = lower(${sector}::text) THEN 0 ELSE 1 END,
      score DESC NULLS LAST, signal_at DESC
    LIMIT ${limit}
  `) as any[]
  return rows as Signal[]
}

/** Distinct sectors present in the feed (for the filter UI). */
export async function signalSectors(limit = 40): Promise<string[]> {
  const rows = (await sql`
    SELECT sector, count(*)::int n FROM market_signals
    WHERE sector IS NOT NULL AND sector <> ''
    GROUP BY sector ORDER BY n DESC LIMIT ${limit}
  `) as any[]
  return rows.map((r) => r.sector)
}
