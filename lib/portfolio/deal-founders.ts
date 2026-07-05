/**
 * Deal-scoped founder profiles (deal_founders table).
 *
 * Each deal can have multiple founders; exactly one is flagged is_primary.
 * The primary founder is auto-seeded from the pitch contact when a deal is
 * created (see createDeal in deal-pipeline.ts). Photos are uploaded to the
 * private Blob store and served through a streaming route.
 *
 * deal_founders.deal_id is TEXT (FK → deal_opportunities.id) — never cast to
 * ::uuid.
 */

import { sql } from "@/lib/db"

export interface DealFounder {
  id: string
  deal_id: string
  name: string
  role: string | null
  email: string | null
  linkedin_url: string | null
  bio: string | null
  photo_url: string | null
  ownership_pct: number | null
  is_primary: boolean
  created_at: string
  updated_at: string
}

let probe: Promise<boolean> | null = null
export function hasFounderTable(): Promise<boolean> {
  if (!probe) {
    probe = (async () => {
      try {
        const rows = await sql`
          SELECT 1 FROM information_schema.tables
           WHERE table_schema = 'public' AND table_name = 'deal_founders'`
        return rows.length > 0
      } catch { return false }
    })()
  }
  return probe
}

function normalize(r: any): DealFounder {
  return {
    id: r.id,
    deal_id: r.deal_id,
    name: r.name,
    role: r.role ?? null,
    email: r.email ?? null,
    linkedin_url: r.linkedin_url ?? null,
    bio: r.bio ?? null,
    photo_url: r.photo_url ?? null,
    ownership_pct: r.ownership_pct == null ? null : Number(r.ownership_pct),
    is_primary: !!r.is_primary,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }
}

export async function listFounders(dealId: string): Promise<DealFounder[]> {
  if (!(await hasFounderTable())) return []
  const rows = await sql`
    SELECT * FROM deal_founders
     WHERE deal_id = ${dealId}
     ORDER BY is_primary DESC, created_at ASC`
  return rows.map(normalize)
}

export interface CreateFounderInput {
  dealId: string
  name: string
  role?: string | null
  email?: string | null
  linkedinUrl?: string | null
  bio?: string | null
  photoUrl?: string | null
  ownershipPct?: number | null
  isPrimary?: boolean
}

export async function createFounder(input: CreateFounderInput): Promise<DealFounder> {
  // If this founder is primary, demote any existing primary first.
  if (input.isPrimary) {
    await sql`UPDATE deal_founders SET is_primary = FALSE WHERE deal_id = ${input.dealId}`
  }
  // First founder on a deal becomes primary automatically.
  const [{ n }] = (await sql`SELECT COUNT(*)::int AS n FROM deal_founders WHERE deal_id = ${input.dealId}`) as any[]
  const isPrimary = input.isPrimary || Number(n) === 0
  const rows = await sql`
    INSERT INTO deal_founders (
      deal_id, name, role, email, linkedin_url, bio, photo_url, ownership_pct, is_primary
    ) VALUES (
      ${input.dealId}, ${input.name.trim()}, ${input.role ?? null}, ${input.email ?? null},
      ${input.linkedinUrl ?? null}, ${input.bio ?? null}, ${input.photoUrl ?? null},
      ${input.ownershipPct ?? null}, ${isPrimary}
    ) RETURNING *`
  return normalize(rows[0])
}

export interface UpdateFounderInput {
  name?: string
  role?: string | null
  email?: string | null
  linkedinUrl?: string | null
  bio?: string | null
  photoUrl?: string | null
  ownershipPct?: number | null
}

export async function getFounder(id: string): Promise<DealFounder | null> {
  const rows = await sql`SELECT * FROM deal_founders WHERE id = ${id} LIMIT 1`
  return rows[0] ? normalize(rows[0]) : null
}

export async function updateFounder(id: string, patch: UpdateFounderInput): Promise<DealFounder | null> {
  const f = await getFounder(id)
  if (!f) return null
  const rows = await sql`
    UPDATE deal_founders SET
      name          = ${patch.name !== undefined ? patch.name.trim() : f.name},
      role          = ${patch.role !== undefined ? patch.role : f.role},
      email         = ${patch.email !== undefined ? patch.email : f.email},
      linkedin_url  = ${patch.linkedinUrl !== undefined ? patch.linkedinUrl : f.linkedin_url},
      bio           = ${patch.bio !== undefined ? patch.bio : f.bio},
      photo_url     = ${patch.photoUrl !== undefined ? patch.photoUrl : f.photo_url},
      ownership_pct = ${patch.ownershipPct !== undefined ? patch.ownershipPct : f.ownership_pct},
      updated_at    = NOW()
    WHERE id = ${id} RETURNING *`
  return rows[0] ? normalize(rows[0]) : null
}

export async function setPrimaryFounder(dealId: string, founderId: string): Promise<DealFounder[]> {
  await sql`UPDATE deal_founders SET is_primary = (id = ${founderId}), updated_at = NOW() WHERE deal_id = ${dealId}`
  return listFounders(dealId)
}

export async function deleteFounder(id: string): Promise<boolean> {
  // Capture the deal + primary flag before deleting so we can re-seat primary.
  const f = await getFounder(id)
  if (!f) return false
  await sql`DELETE FROM deal_founders WHERE id = ${id}`
  // If we removed the primary, promote the oldest remaining founder.
  if (f.is_primary) {
    await sql`
      UPDATE deal_founders SET is_primary = TRUE, updated_at = NOW()
       WHERE id = (
         SELECT id FROM deal_founders WHERE deal_id = ${f.deal_id}
          ORDER BY created_at ASC LIMIT 1
       )`
  }
  return true
}
