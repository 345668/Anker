/**
 * LinkedIn senders — connected accounts the user sends outreach as.
 *
 * A sender carries the per-account safety limits the engine honours (daily
 * caps, working hours, warmup). Phase 1 manages senders from the dashboard;
 * the extension will auto-register the logged-in account in a later pass.
 */
import "server-only"
import { sql } from "@/lib/db"
import { rowToSender, type LinkedInSender, type SenderStatus, SENDER_STATUSES } from "./types"

/** List a user's senders, each with today's completed-action usage merged in. */
export async function listSenders(userId: string): Promise<LinkedInSender[]> {
  const rows = (await sql`
    SELECT * FROM linkedin_senders
    WHERE user_id = ${userId}
    ORDER BY created_at
  `) as any[]

  if (!rows.length) return []

  // Today's usage per sender (done connect/message actions since UTC midnight).
  const usageRows = (await sql`
    SELECT sender_id,
           COUNT(*) FILTER (WHERE action_type = 'connect_request') AS connects,
           COUNT(*) FILTER (WHERE action_type IN ('message','follow_up')) AS messages
    FROM li_action_queue
    WHERE user_id = ${userId}
      AND status = 'done'
      AND completed_at >= date_trunc('day', now())
    GROUP BY sender_id
  `) as any[]
  const usage = new Map<string, { connectsToday: number; messagesToday: number }>()
  for (const u of usageRows) {
    usage.set(String(u.sender_id), {
      connectsToday: Number(u.connects ?? 0),
      messagesToday: Number(u.messages ?? 0),
    })
  }

  return rows.map((r) => {
    const s = rowToSender(r)
    s.usage = usage.get(s.id) ?? { connectsToday: 0, messagesToday: 0 }
    return s
  })
}

export async function getSender(userId: string, id: string): Promise<LinkedInSender | null> {
  const rows = (await sql`
    SELECT * FROM linkedin_senders WHERE id = ${id} AND user_id = ${userId} LIMIT 1
  `) as any[]
  return rows[0] ? rowToSender(rows[0]) : null
}

export interface CreateSenderInput {
  displayName: string
  linkedinUrl?: string | null
  memberUrn?: string | null
  avatarUrl?: string | null
  dailyConnectCap?: number
  dailyMessageCap?: number
  workingHoursStart?: number
  workingHoursEnd?: number
  timezone?: string
  notes?: string | null
}

const clampInt = (n: unknown, lo: number, hi: number, dflt: number): number => {
  const v = Number(n)
  if (!Number.isFinite(v)) return dflt
  return Math.max(lo, Math.min(hi, Math.round(v)))
}

export async function createSender(userId: string, input: CreateSenderInput): Promise<LinkedInSender> {
  const displayName = String(input.displayName || "").trim()
  if (!displayName) throw new Error("displayName is required")

  const connectCap = clampInt(input.dailyConnectCap, 0, 100, 20)
  const messageCap = clampInt(input.dailyMessageCap, 0, 200, 40)
  const whStart = clampInt(input.workingHoursStart, 0, 23, 8)
  const whEnd = clampInt(input.workingHoursEnd, 1, 24, 18)

  const rows = (await sql`
    INSERT INTO linkedin_senders
      (user_id, display_name, linkedin_url, member_urn, avatar_url,
       daily_connect_cap, daily_message_cap, working_hours_start, working_hours_end,
       timezone, notes)
    VALUES
      (${userId}, ${displayName}, ${input.linkedinUrl ?? null}, ${input.memberUrn ?? null},
       ${input.avatarUrl ?? null}, ${connectCap}, ${messageCap}, ${whStart}, ${whEnd},
       ${input.timezone || "UTC"}, ${input.notes ?? null})
    RETURNING *
  `) as any[]
  return rowToSender(rows[0])
}

export interface UpdateSenderInput {
  displayName?: string
  status?: SenderStatus
  dailyConnectCap?: number
  dailyMessageCap?: number
  workingHoursStart?: number
  workingHoursEnd?: number
  timezone?: string
  notes?: string | null
}

/** Partial update. Only provided fields change; each is validated/clamped. */
export async function updateSender(
  userId: string,
  id: string,
  patch: UpdateSenderInput,
): Promise<LinkedInSender | null> {
  const current = await getSender(userId, id)
  if (!current) return null

  const displayName =
    patch.displayName !== undefined ? String(patch.displayName).trim() || current.displayName : current.displayName
  const status =
    patch.status !== undefined && SENDER_STATUSES.includes(patch.status) ? patch.status : current.status
  const connectCap =
    patch.dailyConnectCap !== undefined ? clampInt(patch.dailyConnectCap, 0, 100, current.dailyConnectCap) : current.dailyConnectCap
  const messageCap =
    patch.dailyMessageCap !== undefined ? clampInt(patch.dailyMessageCap, 0, 200, current.dailyMessageCap) : current.dailyMessageCap
  const whStart =
    patch.workingHoursStart !== undefined ? clampInt(patch.workingHoursStart, 0, 23, current.workingHoursStart) : current.workingHoursStart
  const whEnd =
    patch.workingHoursEnd !== undefined ? clampInt(patch.workingHoursEnd, 1, 24, current.workingHoursEnd) : current.workingHoursEnd
  const timezone = patch.timezone !== undefined ? String(patch.timezone) || current.timezone : current.timezone
  const notes = patch.notes !== undefined ? patch.notes : current.notes

  const rows = (await sql`
    UPDATE linkedin_senders SET
      display_name = ${displayName},
      status = ${status},
      daily_connect_cap = ${connectCap},
      daily_message_cap = ${messageCap},
      working_hours_start = ${whStart},
      working_hours_end = ${whEnd},
      timezone = ${timezone},
      notes = ${notes},
      updated_at = now()
    WHERE id = ${id} AND user_id = ${userId}
    RETURNING *
  `) as any[]
  return rows[0] ? rowToSender(rows[0]) : null
}

export async function deleteSender(userId: string, id: string): Promise<boolean> {
  const rows = (await sql`
    DELETE FROM linkedin_senders WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `) as any[]
  return rows.length > 0
}
