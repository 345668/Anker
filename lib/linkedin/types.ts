/**
 * Shared types + constants for the LinkedIn outreach engine (Phase 1).
 * See docs/scope-linkedin-outreach.md.
 */

export const SENDER_STATUSES = ["active", "paused", "restricted", "warming"] as const
export type SenderStatus = (typeof SENDER_STATUSES)[number]

export const ACTION_TYPES = [
  "connect_request",
  "message",
  "follow_up",
  "view_profile",
  "withdraw",
] as const
export type ActionType = (typeof ACTION_TYPES)[number]

/** Action types the extension executor can actually perform in Phase 1. */
export const EXECUTABLE_ACTION_TYPES: ActionType[] = ["connect_request", "message"]

export const ACTION_STATUSES = [
  "pending_approval",
  "queued",
  "claimed",
  "done",
  "failed",
  "skipped",
  "rejected",
] as const
export type ActionStatus = (typeof ACTION_STATUSES)[number]

export interface LinkedInSender {
  id: string
  userId: string
  displayName: string
  linkedinUrl: string | null
  memberUrn: string | null
  avatarUrl: string | null
  status: SenderStatus
  dailyConnectCap: number
  dailyMessageCap: number
  workingHoursStart: number
  workingHoursEnd: number
  timezone: string
  warmupStartedAt: string | null
  lastActionAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
  /** Derived: actions completed today (populated by listSenders). */
  usage?: { connectsToday: number; messagesToday: number }
}

export interface LiAction {
  id: string
  userId: string
  senderId: string | null
  campaignId: string | null
  memberId: string | null
  crmEntryId: string | null
  targetName: string | null
  targetUrl: string
  actionType: ActionType
  payload: Record<string, unknown>
  status: ActionStatus
  approvedBy: string | null
  approvedAt: string | null
  scheduledFor: string | null
  attempts: number
  claimedAt: string | null
  completedAt: string | null
  failedReason: string | null
  result: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

/** DB row (snake_case) → LiAction (camelCase). */
export function rowToAction(r: any): LiAction {
  return {
    id: r.id,
    userId: r.user_id,
    senderId: r.sender_id ?? null,
    campaignId: r.campaign_id ?? null,
    memberId: r.member_id ?? null,
    crmEntryId: r.crm_entry_id ?? null,
    targetName: r.target_name ?? null,
    targetUrl: r.target_url,
    actionType: r.action_type,
    payload: r.payload ?? {},
    status: r.status,
    approvedBy: r.approved_by ?? null,
    approvedAt: r.approved_at ?? null,
    scheduledFor: r.scheduled_for ?? null,
    attempts: Number(r.attempts ?? 0),
    claimedAt: r.claimed_at ?? null,
    completedAt: r.completed_at ?? null,
    failedReason: r.failed_reason ?? null,
    result: r.result ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** DB row → LinkedInSender. usage merged in separately when available. */
export function rowToSender(r: any): LinkedInSender {
  return {
    id: r.id,
    userId: r.user_id,
    displayName: r.display_name,
    linkedinUrl: r.linkedin_url ?? null,
    memberUrn: r.member_urn ?? null,
    avatarUrl: r.avatar_url ?? null,
    status: r.status,
    dailyConnectCap: Number(r.daily_connect_cap ?? 0),
    dailyMessageCap: Number(r.daily_message_cap ?? 0),
    workingHoursStart: Number(r.working_hours_start ?? 0),
    workingHoursEnd: Number(r.working_hours_end ?? 24),
    timezone: r.timezone ?? "UTC",
    warmupStartedAt: r.warmup_started_at ?? null,
    lastActionAt: r.last_action_at ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
