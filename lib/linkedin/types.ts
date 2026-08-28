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

// ── Campaigns / sequencer (Phase 2) ──────────────────────────────────────────

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "archived"] as const
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number]

export const STEP_ACTION_TYPES = ["connect_request", "message", "follow_up"] as const
export type StepActionType = (typeof STEP_ACTION_TYPES)[number]

export const STEP_CONDITIONS = ["any", "if_accepted", "if_no_reply"] as const
export type StepCondition = (typeof STEP_CONDITIONS)[number]

export const MEMBER_STATES = ["active", "completed", "stopped", "replied"] as const
export type MemberState = (typeof MEMBER_STATES)[number]

export interface LiCampaign {
  id: string
  userId: string
  name: string
  status: CampaignStatus
  senderId: string | null
  fullAuto: boolean
  createdAt: string
  updatedAt: string
}

export interface LiCampaignStep {
  id: string
  campaignId: string
  stepOrder: number
  actionType: StepActionType
  template: string
  delayHours: number
  condition: StepCondition
}

export interface LiCampaignMember {
  id: string
  campaignId: string
  userId: string
  crmEntryId: string | null
  targetUrl: string
  targetName: string | null
  currentStep: number
  lastActionId: string | null
  lastActionAt: string | null
  state: MemberState
  stoppedReason: string | null
  /** Set when the invitee accepted the connection request (from the extension). */
  acceptedAt: string | null
  enrolledAt: string
  updatedAt: string
}

export function rowToCampaign(r: any): LiCampaign {
  return {
    id: r.id,
    userId: r.user_id,
    name: r.name,
    status: r.status,
    senderId: r.sender_id ?? null,
    fullAuto: r.full_auto === true || r.full_auto === "t",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function rowToStep(r: any): LiCampaignStep {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    stepOrder: Number(r.step_order),
    actionType: r.action_type,
    template: r.template ?? "",
    delayHours: Number(r.delay_hours ?? 0),
    condition: r.condition ?? "any",
  }
}

export function rowToMember(r: any): LiCampaignMember {
  return {
    id: r.id,
    campaignId: r.campaign_id,
    userId: r.user_id,
    crmEntryId: r.crm_entry_id ?? null,
    targetUrl: r.target_url,
    targetName: r.target_name ?? null,
    currentStep: Number(r.current_step ?? 0),
    lastActionId: r.last_action_id ?? null,
    lastActionAt: r.last_action_at ?? null,
    state: r.state,
    stoppedReason: r.stopped_reason ?? null,
    acceptedAt: r.accepted_at ?? null,
    enrolledAt: r.enrolled_at,
    updatedAt: r.updated_at,
  }
}

// ── Unibox / inbox (Phase 3) ─────────────────────────────────────────────────

export type MessageDirection = "inbound" | "outbound"

export interface LiConversation {
  id: string
  userId: string
  senderId: string | null
  threadUrn: string | null
  participantUrl: string | null
  participantName: string | null
  campaignId: string | null
  memberId: string | null
  lastMessageAt: string | null
  lastMessageText: string | null
  lastDirection: MessageDirection | null
  unread: boolean
  createdAt: string
  updatedAt: string
}

export interface LiMessage {
  id: string
  conversationId: string
  userId: string
  direction: MessageDirection
  body: string
  sentAt: string | null
  externalId: string | null
  createdAt: string
}

export function rowToConversation(r: any): LiConversation {
  return {
    id: r.id,
    userId: r.user_id,
    senderId: r.sender_id ?? null,
    threadUrn: r.thread_urn ?? null,
    participantUrl: r.participant_url ?? null,
    participantName: r.participant_name ?? null,
    campaignId: r.campaign_id ?? null,
    memberId: r.member_id ?? null,
    lastMessageAt: r.last_message_at ?? null,
    lastMessageText: r.last_message_text ?? null,
    lastDirection: r.last_direction ?? null,
    unread: r.unread === true || r.unread === "t",
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function rowToMessage(r: any): LiMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    userId: r.user_id,
    direction: r.direction,
    body: r.body ?? "",
    sentAt: r.sent_at ?? null,
    externalId: r.external_id ?? null,
    createdAt: r.created_at,
  }
}

/** Fill {{firstName}} / {{name}} tokens from a target name. */
export function renderTemplate(template: string, targetName: string | null): string {
  const name = (targetName || "").trim()
  const firstName = name.split(/\s+/)[0] || "there"
  return template
    .replace(/\{\{\s*firstName\s*\}\}/gi, firstName)
    .replace(/\{\{\s*name\s*\}\}/gi, name || firstName)
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
