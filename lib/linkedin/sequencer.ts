/**
 * The sequencer — advances campaign members through their steps.
 *
 * n8n owns the *timing* (it calls tickCampaign on a schedule); this owns the
 * *logic*. Each tick, for every active member, it either:
 *   • advances the member when their in-flight step action has completed,
 *   • enqueues the next step's action when the step's delay has elapsed and the
 *     sender's sending window allows it, or
 *   • holds (does nothing) when waiting on a delay, an approval, caps, or hours.
 *
 * Safety invariants:
 *   • Conditional steps (if_accepted / if_no_reply) always route through human
 *     approval until Phase 3 provides real acceptance/reply signals — even in a
 *     full-auto campaign. Only 'any' steps can be auto-approved.
 *   • Nothing is enqueued outside the sender's caps / working hours / warmup
 *     (canSendNow). Over-cap or off-hours members are held, never failed.
 */
import "server-only"
import { sql } from "@/lib/db"
import { getCampaign, listSteps, campaignSenderPool } from "./campaigns"
import { enqueueAction, reclaimStaleActions } from "./action-queue"
import { canSendNow } from "./sending-window"
import { renderTemplate, rowToMember, type LiCampaignMember, type LiCampaignStep, type LinkedInSender, type StepActionType } from "./types"

export interface TickResult {
  campaignId: string
  processed: number
  enqueued: number
  advanced: number
  completed: number
  stopped: number
  held: number
  reason?: string
  holds?: Record<string, number>
}

const hoursSince = (iso: string | null, now: Date): number =>
  iso ? (now.getTime() - new Date(iso).getTime()) / 3_600_000 : Number.POSITIVE_INFINITY

const remainingFor = (d: { capsRemaining?: { connect: number; message: number } }, t: StepActionType) =>
  t === "connect_request" ? d.capsRemaining?.connect ?? 0 : d.capsRemaining?.message ?? 0

/**
 * Resolve which sender executes this member's action (multi-sender rotation).
 * A member's sender is sticky once assigned (coherent per-person sequence). If
 * unassigned, pick the eligible sender with the most remaining capacity —
 * spreading load across the pool. Returns null when no sender can send now
 * (→ hold), and `assign` when the choice should be persisted to the member.
 */
async function resolveMemberSender(
  pool: LinkedInSender[],
  member: LiCampaignMember,
  actionType: StepActionType,
  now: Date,
): Promise<{ sender: LinkedInSender; assign: boolean } | null> {
  if (member.senderId) {
    const s = pool.find((p) => p.id === member.senderId)
    if (s) return (await canSendNow(s, actionType, now)).allowed ? { sender: s, assign: false } : null
    // assigned sender left the pool → fall through and pick a new one.
  }
  let best: LinkedInSender | null = null
  let bestRemaining = -1
  for (const s of pool) {
    const d = await canSendNow(s, actionType, now)
    if (d.allowed) {
      const rem = remainingFor(d, actionType)
      if (rem > bestRemaining) { best = s; bestRemaining = rem }
    }
  }
  return best ? { sender: best, assign: true } : null
}

/** Advance one campaign by one tick. Idempotent-ish: safe to call repeatedly. */
export async function tickCampaign(userId: string, campaignId: string, now = new Date()): Promise<TickResult> {
  const base: TickResult = { campaignId, processed: 0, enqueued: 0, advanced: 0, completed: 0, stopped: 0, held: 0, holds: {} }

  const campaign = await getCampaign(userId, campaignId)
  if (!campaign) return { ...base, reason: "not_found" }
  if (campaign.status !== "active") return { ...base, reason: `status:${campaign.status}` }

  // Fallback recovery: if the extension isn't polling (so claimActions never
  // runs), still recover actions stranded 'claimed' past the TTL, so a member
  // waiting on a dead action isn't stuck forever. Cheap + idempotent.
  await reclaimStaleActions(userId).catch(() => {})

  const steps = await listSteps(campaignId)
  if (!steps.length) return { ...base, reason: "no_steps" }

  const pool = await campaignSenderPool(userId, campaign)
  if (!pool.length) return { ...base, reason: "no_sender" }

  const members = (await sql`
    SELECT * FROM li_campaign_members
    WHERE campaign_id = ${campaignId} AND user_id = ${userId} AND state = 'active'
  `) as any[]

  const hold = (k: string) => { base.held++; base.holds![k] = (base.holds![k] ?? 0) + 1 }

  for (const row of members) {
    const m = rowToMember(row)
    base.processed++
    try {
      // 1) An action is in flight → resolve it (advance / stop) or wait.
      if (m.lastActionId) {
        const a = (await sql`SELECT status, completed_at FROM li_action_queue WHERE id = ${m.lastActionId}`) as any[]
        const status = a[0]?.status as string | undefined
        if (!status || status === "done") {
          const completedAt = a[0]?.completed_at ?? new Date().toISOString()
          const nextStep = m.currentStep + 1
          if (nextStep >= steps.length) {
            await sql`UPDATE li_campaign_members SET state = 'completed', current_step = ${nextStep}, last_action_id = NULL, last_action_at = ${completedAt}, updated_at = now() WHERE id = ${m.id}`
            base.completed++
          } else {
            await sql`UPDATE li_campaign_members SET current_step = ${nextStep}, last_action_id = NULL, last_action_at = ${completedAt}, updated_at = now() WHERE id = ${m.id}`
            base.advanced++
          }
          continue
        }
        if (status === "failed" || status === "rejected" || status === "skipped") {
          await sql`UPDATE li_campaign_members SET state = 'stopped', stopped_reason = ${`action_${status}`}, updated_at = now() WHERE id = ${m.id}`
          base.stopped++
          continue
        }
        // pending_approval / queued / claimed → still in flight; wait.
        hold("in_flight")
        continue
      }

      // 2) No action in flight → maybe enqueue the current step.
      const step = steps[m.currentStep] as LiCampaignStep | undefined
      if (!step) {
        await sql`UPDATE li_campaign_members SET state = 'completed', updated_at = now() WHERE id = ${m.id}`
        base.completed++
        continue
      }

      // Delay gate: wait delay_hours after the previous step completed
      // (or after enrolment for the first step).
      const sinceRef = m.lastActionAt ?? m.enrolledAt
      if (hoursSince(sinceRef, now) < step.delayHours) { hold("delay"); continue }

      // if_accepted gate: only proceed once the connection was accepted (the
      // extension's invite sync stamps accepted_at). Members awaiting acceptance
      // hold here — we never message someone who hasn't connected.
      if (step.condition === "if_accepted" && !m.acceptedAt) { hold("awaiting_acceptance"); continue }

      // Sending window + sender rotation: pick/reuse the member's sender,
      // respecting status / hours / warmup-adjusted caps across the pool.
      const resolved = await resolveMemberSender(pool, m, step.actionType, now)
      if (!resolved) { hold("window"); continue }
      const sender = resolved.sender
      if (resolved.assign) {
        await sql`UPDATE li_campaign_members SET sender_id = ${sender.id}, updated_at = now() WHERE id = ${m.id}`
      }

      // Auto-approve rule. A member reaching this point satisfies its step's
      // condition: 'if_no_reply' (replied members are stopped by Phase 3 reply-
      // stop) and 'if_accepted' (gated above on accepted_at) are both confirmed,
      // so all conditions can inherit the campaign's full-auto setting.
      const autoApprove = campaign.fullAuto

      const action = await enqueueAction(userId, {
        actionType: step.actionType,
        targetUrl: m.targetUrl,
        targetName: m.targetName,
        senderId: sender.id,
        campaignId,
        memberId: m.id,
        crmEntryId: m.crmEntryId,
        payload: { message: renderTemplate(step.template, m.targetName) },
        autoApprove,
        approvedBy: autoApprove ? "sequencer:auto" : null,
      })
      await sql`UPDATE li_campaign_members SET last_action_id = ${action.id}, updated_at = now() WHERE id = ${m.id}`
      base.enqueued++
    } catch {
      // One bad member must not abort the whole tick.
      hold("error")
    }
  }

  return base
}

/** Tick every active campaign for a user. Used by the orchestration endpoint. */
export async function tickAllActive(userId: string, now = new Date()): Promise<TickResult[]> {
  const rows = (await sql`SELECT id FROM li_campaigns WHERE user_id = ${userId} AND status = 'active'`) as any[]
  const out: TickResult[] = []
  for (const r of rows) out.push(await tickCampaign(userId, r.id, now))
  return out
}
