/**
 * LinkedIn campaigns — sequences, steps, and enrolled members (Phase 2).
 * CRUD only; the advancement logic lives in ./sequencer.
 */
import "server-only"
import { sql } from "@/lib/db"
import {
  rowToCampaign, rowToStep, rowToMember,
  type LiCampaign, type LiCampaignStep, type LiCampaignMember,
  type CampaignStatus, type StepActionType, type StepCondition,
  CAMPAIGN_STATUSES, STEP_ACTION_TYPES, STEP_CONDITIONS,
} from "./types"

// ── Campaigns ────────────────────────────────────────────────────────────────

export async function listCampaigns(userId: string): Promise<LiCampaign[]> {
  const rows = (await sql`
    SELECT * FROM li_campaigns WHERE user_id = ${userId} AND status <> 'archived'
    ORDER BY created_at DESC
  `) as any[]
  return rows.map(rowToCampaign)
}

export async function getCampaign(userId: string, id: string): Promise<LiCampaign | null> {
  const rows = (await sql`SELECT * FROM li_campaigns WHERE id = ${id} AND user_id = ${userId} LIMIT 1`) as any[]
  return rows[0] ? rowToCampaign(rows[0]) : null
}

export async function createCampaign(
  userId: string,
  input: { name: string; senderId?: string | null; fullAuto?: boolean },
): Promise<LiCampaign> {
  const name = String(input.name || "").trim()
  if (!name) throw new Error("name is required")
  const rows = (await sql`
    INSERT INTO li_campaigns (user_id, name, sender_id, full_auto)
    VALUES (${userId}, ${name}, ${input.senderId ?? null}, ${input.fullAuto === true})
    RETURNING *
  `) as any[]
  return rowToCampaign(rows[0])
}

export async function updateCampaign(
  userId: string,
  id: string,
  patch: { name?: string; status?: CampaignStatus; senderId?: string | null; fullAuto?: boolean },
): Promise<LiCampaign | null> {
  const cur = await getCampaign(userId, id)
  if (!cur) return null
  const name = patch.name !== undefined ? String(patch.name).trim() || cur.name : cur.name
  const status = patch.status !== undefined && CAMPAIGN_STATUSES.includes(patch.status) ? patch.status : cur.status
  const senderId = patch.senderId !== undefined ? patch.senderId : cur.senderId
  const fullAuto = patch.fullAuto !== undefined ? patch.fullAuto === true : cur.fullAuto
  const rows = (await sql`
    UPDATE li_campaigns
    SET name = ${name}, status = ${status}, sender_id = ${senderId}, full_auto = ${fullAuto}, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `) as any[]
  return rows[0] ? rowToCampaign(rows[0]) : null
}

// ── Steps ────────────────────────────────────────────────────────────────────

export async function listSteps(campaignId: string): Promise<LiCampaignStep[]> {
  const rows = (await sql`
    SELECT * FROM li_campaign_steps WHERE campaign_id = ${campaignId} ORDER BY step_order
  `) as any[]
  return rows.map(rowToStep)
}

export interface StepInput {
  actionType: StepActionType
  template?: string
  delayHours?: number
  condition?: StepCondition
}

/**
 * Replace a campaign's whole sequence with `steps` (0-based ordering by array
 * position). Simpler + race-free vs. per-step edits from the builder UI.
 */
export async function setSteps(userId: string, campaignId: string, steps: StepInput[]): Promise<LiCampaignStep[]> {
  const owned = await getCampaign(userId, campaignId)
  if (!owned) throw new Error("Campaign not found")

  await sql`DELETE FROM li_campaign_steps WHERE campaign_id = ${campaignId}`
  let order = 0
  for (const s of steps) {
    const actionType = STEP_ACTION_TYPES.includes(s.actionType) ? s.actionType : "message"
    const condition = s.condition && STEP_CONDITIONS.includes(s.condition) ? s.condition : "any"
    const delay = Math.max(0, Math.min(24 * 60, Math.round(Number(s.delayHours) || 0)))
    await sql`
      INSERT INTO li_campaign_steps (campaign_id, step_order, action_type, template, delay_hours, condition)
      VALUES (${campaignId}, ${order}, ${actionType}, ${String(s.template ?? "")}, ${delay}, ${condition})
    `
    order++
  }
  return listSteps(campaignId)
}

// ── Members ──────────────────────────────────────────────────────────────────

export async function listMembers(campaignId: string): Promise<LiCampaignMember[]> {
  const rows = (await sql`
    SELECT * FROM li_campaign_members WHERE campaign_id = ${campaignId} ORDER BY enrolled_at DESC
  `) as any[]
  return rows.map(rowToMember)
}

export interface EnrollInput { targetUrl: string; targetName?: string | null; crmEntryId?: string | null }

/** Enroll people. Idempotent per (campaign, target_url). Returns count added. */
export async function enrollMembers(userId: string, campaignId: string, people: EnrollInput[]): Promise<number> {
  const owned = await getCampaign(userId, campaignId)
  if (!owned) throw new Error("Campaign not found")
  let added = 0
  for (const p of people) {
    const url = String(p.targetUrl || "").trim()
    if (!url) continue
    const rows = (await sql`
      INSERT INTO li_campaign_members (campaign_id, user_id, target_url, target_name, crm_entry_id)
      VALUES (${campaignId}, ${userId}, ${url}, ${p.targetName ?? null}, ${p.crmEntryId ?? null})
      ON CONFLICT (campaign_id, target_url) DO NOTHING
      RETURNING id
    `) as any[]
    if (rows.length) added++
  }
  return added
}

export async function removeMember(userId: string, campaignId: string, memberId: string): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM li_campaign_members
    WHERE id = ${memberId} AND campaign_id = ${campaignId} AND user_id = ${userId}
    RETURNING id
  `) as any[]
  return rows.length > 0
}

/** Per-campaign member state tallies for the builder header. */
export async function memberStateCounts(campaignId: string): Promise<Record<string, number>> {
  const rows = (await sql`
    SELECT state, COUNT(*)::int AS n FROM li_campaign_members WHERE campaign_id = ${campaignId} GROUP BY state
  `) as any[]
  const out: Record<string, number> = {}
  for (const r of rows) out[r.state] = Number(r.n)
  return out
}
