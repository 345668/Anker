/**
 * LinkedIn connections storage — the user's own 1st-degree graph.
 *
 * Populated by the Anker Chrome extension's "My Connections" capture
 * (scrolls linkedin.com/mynetwork/.../connections/ and extracts each
 * row). Distinct from crm_entries: connections are people already in
 * the user's LinkedIn graph; CRM entries are outreach targets. They
 * link on the LinkedIn profile URL when the CRM row has one.
 *
 * Schema-drift safe — every call probes information_schema once per
 * process. The Network page gracefully surfaces an empty state when
 * the migration hasn't run.
 */

import { sql } from "@/lib/db"

// ── types ───────────────────────────────────────────────────────────────

export interface LinkedInConnection {
  id: string
  ownerUserId: string
  profileSlug: string
  profileUrl: string
  fullName: string | null
  firstName: string | null
  lastName: string | null
  headline: string | null
  title: string | null
  firm: string | null
  firmSlug: string | null
  location: string | null
  imageUrl: string | null
  connectedAt: string | null
  firstSeen: string
  lastSeen: string
  rawMeta: Record<string, any>
}

/** One row extracted from a connections-page card. All fields optional
 *  except profileSlug — everything else is best-effort scraping. */
export interface ConnectionUpsertInput {
  profileSlug: string
  profileUrl: string
  fullName?: string | null
  firstName?: string | null
  lastName?: string | null
  headline?: string | null
  title?: string | null
  firm?: string | null
  location?: string | null
  imageUrl?: string | null
  connectedAt?: string | null
  raw?: Record<string, any>
}

// ── schema probe ──────────────────────────────────────────────────────-

let _tableCheck: Promise<boolean> | null = null
export function hasConnectionsTable(): Promise<boolean> {
  if (_tableCheck) return _tableCheck
  _tableCheck = (async () => {
    try {
      const r: any[] = await sql`
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'linkedin_connections'
         LIMIT 1`
      return r.length > 0
    } catch { return false }
  })()
  return _tableCheck
}

// ── reads ──────────────────────────────────────────────────────────────

export async function listConnections(ownerUserId: string): Promise<LinkedInConnection[]> {
  if (!(await hasConnectionsTable())) return []
  try {
    const rows: any[] = await sql`
      SELECT * FROM linkedin_connections
       WHERE owner_user_id = ${ownerUserId}::uuid
       ORDER BY COALESCE(last_seen, first_seen) DESC`
    return rows.map(mapRow)
  } catch (e) {
    console.error("[network listConnections]", e)
    return []
  }
}

export async function connectionCount(ownerUserId: string): Promise<number> {
  if (!(await hasConnectionsTable())) return 0
  try {
    const rows: any[] = await sql`
      SELECT COUNT(*) AS n FROM linkedin_connections
       WHERE owner_user_id = ${ownerUserId}::uuid`
    return Number(rows[0]?.n ?? 0)
  } catch { return 0 }
}

// ── writes ─────────────────────────────────────────────────────────────

/**
 * Upsert a batch of connections. Idempotent on (owner_user_id, profile_slug)
 * — repeated captures update last_seen + fill in any newly-scraped fields
 * without clobbering existing values.
 */
export async function upsertConnections(
  ownerUserId: string,
  items: ConnectionUpsertInput[],
): Promise<{ inserted: number; updated: number }> {
  if (!(await hasConnectionsTable())) {
    throw new Error("linkedin_connections table missing — run scripts/oneshot/run-linkedin-connections-table.mjs")
  }
  let inserted = 0, updated = 0
  for (const item of items) {
    if (!item.profileSlug || !item.profileUrl) continue
    const firmSlug = item.firm ? slugify(item.firm) : null
    try {
      const rows: any[] = await sql`
        INSERT INTO linkedin_connections (
          owner_user_id, profile_slug, profile_url,
          full_name, first_name, last_name, headline, title, firm, firm_slug,
          location, image_url, connected_at, raw_meta
        ) VALUES (
          ${ownerUserId}::uuid, ${item.profileSlug}, ${item.profileUrl},
          ${item.fullName ?? null}, ${item.firstName ?? null}, ${item.lastName ?? null},
          ${item.headline ?? null}, ${item.title ?? null}, ${item.firm ?? null}, ${firmSlug},
          ${item.location ?? null}, ${item.imageUrl ?? null},
          ${item.connectedAt ?? null},
          ${JSON.stringify(item.raw ?? {})}::jsonb
        )
        ON CONFLICT (owner_user_id, profile_slug) DO UPDATE SET
          last_seen  = NOW(),
          full_name  = COALESCE(EXCLUDED.full_name,  linkedin_connections.full_name),
          first_name = COALESCE(EXCLUDED.first_name, linkedin_connections.first_name),
          last_name  = COALESCE(EXCLUDED.last_name,  linkedin_connections.last_name),
          headline   = COALESCE(EXCLUDED.headline,   linkedin_connections.headline),
          title      = COALESCE(EXCLUDED.title,      linkedin_connections.title),
          firm       = COALESCE(EXCLUDED.firm,       linkedin_connections.firm),
          firm_slug  = COALESCE(EXCLUDED.firm_slug,  linkedin_connections.firm_slug),
          location   = COALESCE(EXCLUDED.location,   linkedin_connections.location),
          image_url  = COALESCE(EXCLUDED.image_url,  linkedin_connections.image_url),
          connected_at = COALESCE(EXCLUDED.connected_at, linkedin_connections.connected_at),
          raw_meta   = linkedin_connections.raw_meta || EXCLUDED.raw_meta
        RETURNING (xmax = 0) AS was_insert`
      if (rows[0]?.was_insert) inserted++
      else updated++
    } catch (e) {
      console.error(`[network upsert] ${item.profileSlug}`, e)
    }
  }
  return { inserted, updated }
}

// ── helpers ─────────────────────────────────────────────────────────────

function mapRow(r: any): LinkedInConnection {
  return {
    id: r.id,
    ownerUserId: r.owner_user_id,
    profileSlug: r.profile_slug,
    profileUrl: r.profile_url,
    fullName: r.full_name,
    firstName: r.first_name,
    lastName: r.last_name,
    headline: r.headline,
    title: r.title,
    firm: r.firm,
    firmSlug: r.firm_slug,
    location: r.location,
    imageUrl: r.image_url,
    connectedAt: r.connected_at ? new Date(r.connected_at).toISOString() : null,
    firstSeen: typeof r.first_seen === "string" ? r.first_seen : new Date(r.first_seen).toISOString(),
    lastSeen: typeof r.last_seen === "string" ? r.last_seen : new Date(r.last_seen).toISOString(),
    rawMeta: r.raw_meta ?? {},
  }
}

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
}
