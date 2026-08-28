/**
 * Lead lists — reusable audiences (Phase 4).
 *
 * Build a list from a CSV/paste or import from the connections/search results
 * the extension already captures into linkedin_connections, then bulk-enroll the
 * whole list into a campaign as li_campaign_members.
 */
import "server-only"
import { sql } from "@/lib/db"
import {
  rowToLeadList, rowToLeadListMember,
  type LiLeadList, type LiLeadListMember, type LeadListSource, LEAD_LIST_SOURCES,
} from "./types"
import { normalizeProfileUrl } from "./inbox"

// ── Lists ────────────────────────────────────────────────────────────────────

import { getMemberships } from "@/lib/org/active"

/** The org ids a user belongs to (for workspace-shared visibility). */
async function orgIdsFor(userId: string): Promise<string[]> {
  try { return (await getMemberships(userId)).map((m) => m.orgId) } catch { return [] }
}

/** Own lists + lists shared with any org the user belongs to. */
export async function listLeadLists(userId: string): Promise<LiLeadList[]> {
  const orgIds = await orgIdsFor(userId)
  const rows = (await sql`
    SELECT l.*, COUNT(m.id)::int AS member_count, (l.user_id = ${userId}) AS owned
    FROM li_lead_lists l
    LEFT JOIN li_lead_list_members m ON m.list_id = l.id
    WHERE l.user_id = ${userId}
       OR (l.shared_org_id IS NOT NULL AND l.shared_org_id = ANY(${orgIds}::text[]))
    GROUP BY l.id
    ORDER BY l.created_at DESC
  `) as any[]
  return rows.map(rowToLeadList)
}

/** Owner-only fetch (writes: rename, add, delete, share). */
export async function getLeadList(userId: string, id: string): Promise<LiLeadList | null> {
  const rows = (await sql`SELECT *, true AS owned FROM li_lead_lists WHERE id = ${id} AND user_id = ${userId} LIMIT 1`) as any[]
  return rows[0] ? rowToLeadList(rows[0]) : null
}

/** Readable fetch: owner OR shared with one of the user's orgs (read + enroll). */
export async function getReadableLeadList(userId: string, id: string): Promise<LiLeadList | null> {
  const orgIds = await orgIdsFor(userId)
  const rows = (await sql`
    SELECT *, (user_id = ${userId}) AS owned FROM li_lead_lists
    WHERE id = ${id}
      AND (user_id = ${userId} OR (shared_org_id IS NOT NULL AND shared_org_id = ANY(${orgIds}::text[])))
    LIMIT 1
  `) as any[]
  return rows[0] ? rowToLeadList(rows[0]) : null
}

/** Share (or un-share) a list with an org. Owner-only; validates membership. */
export async function shareLeadList(userId: string, listId: string, orgId: string | null): Promise<LiLeadList | null> {
  if (!(await getLeadList(userId, listId))) return null
  if (orgId) {
    const orgIds = await orgIdsFor(userId)
    if (!orgIds.includes(orgId)) throw new Error("You are not a member of that workspace")
  }
  const rows = (await sql`
    UPDATE li_lead_lists SET shared_org_id = ${orgId}, updated_at = now()
    WHERE id = ${listId} AND user_id = ${userId} RETURNING *, true AS owned
  `) as any[]
  return rows[0] ? rowToLeadList(rows[0]) : null
}

export async function createLeadList(userId: string, name: string, source: LeadListSource = "manual"): Promise<LiLeadList> {
  const n = String(name || "").trim()
  if (!n) throw new Error("name is required")
  const src = LEAD_LIST_SOURCES.includes(source) ? source : "manual"
  const rows = (await sql`
    INSERT INTO li_lead_lists (user_id, name, source) VALUES (${userId}, ${n}, ${src}) RETURNING *
  `) as any[]
  return rowToLeadList(rows[0])
}

export async function renameLeadList(userId: string, id: string, name: string): Promise<LiLeadList | null> {
  const n = String(name || "").trim()
  if (!n) return getLeadList(userId, id)
  const rows = (await sql`
    UPDATE li_lead_lists SET name = ${n}, updated_at = now() WHERE id = ${id} AND user_id = ${userId} RETURNING *
  `) as any[]
  return rows[0] ? rowToLeadList(rows[0]) : null
}

export async function deleteLeadList(userId: string, id: string): Promise<boolean> {
  const rows = (await sql`DELETE FROM li_lead_lists WHERE id = ${id} AND user_id = ${userId} RETURNING id`) as any[]
  return rows.length > 0
}

// ── Members ──────────────────────────────────────────────────────────────────

export async function listLeadListMembers(listId: string): Promise<LiLeadListMember[]> {
  const rows = (await sql`
    SELECT * FROM li_lead_list_members WHERE list_id = ${listId} ORDER BY created_at DESC
  `) as any[]
  return rows.map(rowToLeadListMember)
}

export interface AddLeadInput {
  targetUrl: string
  targetName?: string | null
  headline?: string | null
  company?: string | null
  crmEntryId?: string | null
}

/** Add people to a list. Idempotent per (list, target_url). Returns count added. */
export async function addLeadListMembers(userId: string, listId: string, people: AddLeadInput[]): Promise<number> {
  const owned = await getLeadList(userId, listId)
  if (!owned) throw new Error("List not found")
  let added = 0
  for (const p of people) {
    const url = String(p.targetUrl || "").trim()
    if (!url || !/linkedin\.com\/in\//i.test(url)) continue
    const rows = (await sql`
      INSERT INTO li_lead_list_members (list_id, user_id, target_url, target_name, headline, company, crm_entry_id)
      VALUES (${listId}, ${userId}, ${url}, ${p.targetName ?? null}, ${p.headline ?? null}, ${p.company ?? null}, ${p.crmEntryId ?? null})
      ON CONFLICT (list_id, target_url) DO NOTHING
      RETURNING id
    `) as any[]
    if (rows.length) added++
  }
  return added
}

export async function removeLeadListMember(userId: string, listId: string, memberId: string): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM li_lead_list_members WHERE id = ${memberId} AND list_id = ${listId} AND user_id = ${userId} RETURNING id
  `) as any[]
  return rows.length > 0
}

/**
 * Import people from the user's captured linkedin_connections into a list.
 * Filters: degree (1|2|3), companyLike (ILIKE substring), limit. Reuses the
 * search/connections the extension already scrapes — no new capture needed.
 */
export async function importFromConnections(
  userId: string,
  listId: string,
  filters: { degree?: number; companyLike?: string; limit?: number } = {},
): Promise<number> {
  const owned = await getLeadList(userId, listId)
  if (!owned) throw new Error("List not found")
  const limit = Math.max(1, Math.min(1000, filters.limit ?? 500))
  const degree = filters.degree && [1, 2, 3].includes(filters.degree) ? filters.degree : null
  const like = filters.companyLike ? `%${filters.companyLike}%` : null

  const rows = (await sql`
    SELECT linkedin_url, full_name, headline, company FROM linkedin_connections
    WHERE owner_id = ${userId}
      AND (${degree}::int IS NULL OR degree = ${degree})
      AND (${like}::text IS NULL OR company ILIKE ${like})
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `) as any[]

  return addLeadListMembers(
    userId,
    listId,
    rows.map((r) => ({ targetUrl: r.linkedin_url, targetName: r.full_name, headline: r.headline, company: r.company })),
  )
}

/**
 * Bulk-enroll a whole list into a campaign as li_campaign_members. Idempotent
 * per (campaign, target_url). Returns count enrolled.
 */
export async function enrollListIntoCampaign(userId: string, listId: string, campaignId: string): Promise<number> {
  // List must be readable (own or shared into the user's workspace); the
  // campaign must be the user's own.
  const list = await getReadableLeadList(userId, listId)
  if (!list) throw new Error("List not found")
  const camp = (await sql`SELECT id FROM li_campaigns WHERE id = ${campaignId} AND user_id = ${userId} LIMIT 1`) as any[]
  if (!camp.length) throw new Error("Campaign not found")

  const members = await listLeadListMembers(listId)
  let added = 0
  for (const m of members) {
    const rows = (await sql`
      INSERT INTO li_campaign_members (campaign_id, user_id, target_url, target_name, crm_entry_id)
      VALUES (${campaignId}, ${userId}, ${m.targetUrl}, ${m.targetName}, ${m.crmEntryId})
      ON CONFLICT (campaign_id, target_url) DO NOTHING
      RETURNING id
    `) as any[]
    if (rows.length) added++
  }
  return added
}

/** Parse a CSV/paste blob into leads. Accepts "Name, url" / "Name | url" / bare URL per line. */
export function parseLeadBlob(blob: string): AddLeadInput[] {
  const out: AddLeadInput[] = []
  for (const raw of String(blob || "").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const parts = line.split(/\s*[|,]\s*/)
    const url = parts.find((p) => /linkedin\.com\/in\//i.test(p))
    if (!url) continue
    const name = parts.find((p) => p !== url && !/https?:/i.test(p)) || null
    out.push({ targetUrl: url, targetName: name })
  }
  return out
}

// re-export so callers can normalize when matching (kept alongside inbox's copy).
export { normalizeProfileUrl }
