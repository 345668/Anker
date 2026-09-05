/**
 * Reply-handling actions — the pieces that turn an inbound investor signal
 * into a decision, shared by the inbox-poll cron and the manual replies route.
 *
 * Three responsibilities (P0 of docs/founder-outreach-audit.md):
 *   • founderContextForUser  — derive the founder profile the classifier needs
 *   • suppressFollowupsOnReply — stop nudging someone the moment they reply
 *   • autoClassifyPendingReplies — classify + draft for replies sitting NULL
 */
import "server-only"
import { sql } from "@/lib/db"
import { classifyAndDraftReply } from "@/lib/ai/reply-handler"
import { resolveProvider } from "@/lib/ai/provider"

export interface FounderCtx {
  companyName: string
  oneLiner: string
  facts: string[]
  calendarUrl?: string
}

/**
 * The founder identity the reply classifier needs, pulled from the user's
 * default sender profile (sender_profiles.profile_set). Null when the user
 * hasn't built a profile yet (classification is skipped until they do).
 */
export async function founderContextForUser(userId: string): Promise<FounderCtx | null> {
  const [row] = (await sql`
    SELECT profile_set FROM sender_profiles
    WHERE user_id = ${userId} AND profile_set IS NOT NULL
    ORDER BY is_default DESC, updated_at DESC
    LIMIT 1
  `) as any[]
  const p = row?.profile_set
  if (!p || !p.companyName || !p.oneLiner) return null
  return {
    companyName: String(p.companyName),
    oneLiner: String(p.oneLiner),
    facts: Array.isArray(p.facts) ? p.facts.filter((f: any) => typeof f === "string") : [],
    calendarUrl: p.calendarUrl ? String(p.calendarUrl) : undefined,
  }
}

/**
 * A reply landed for this CRM entry: stop the sequence from talking over it.
 *   • mark the message they replied to as 'replied'
 *   • clear every pending follow-up flag on the entry
 *   • cancel not-yet-sent outbound *sequence* steps (never our own 'reply's)
 * Idempotent and safe to call from either ingestion path.
 */
export async function suppressFollowupsOnReply(
  userId: string,
  crmEntryId: string,
  originalMessageId?: string | null,
): Promise<void> {
  if (originalMessageId) {
    await sql`
      UPDATE outreach_messages SET status = 'replied', updated_at = NOW()
      WHERE id = ${originalMessageId} AND user_id = ${userId}
        AND status NOT IN ('cancelled','failed')
    `
  }
  await sql`
    UPDATE outreach_messages SET needs_followup = false, followup_due_at = NULL, updated_at = NOW()
    WHERE user_id = ${userId} AND crm_entry_id = ${crmEntryId}
      AND (needs_followup = true OR followup_due_at IS NOT NULL)
  `
  await sql`
    UPDATE outreach_messages SET status = 'cancelled', updated_at = NOW()
    WHERE user_id = ${userId} AND crm_entry_id = ${crmEntryId}
      AND status IN ('draft','queued') AND kind <> 'reply'
  `
}

export interface AutoClassifyResult {
  considered: number
  classified: number
  suppressed: number
  skippedNoFounder: number
  errors: number
}

/**
 * Classify + draft every inbound reply still sitting at classification IS NULL
 * (the state the IMAP poller ingests them in). For each: suppress follow-ups,
 * run the classifier with the founder's own context, persist the draft +
 * recommended stage, and advance the CRM stage.
 */
export async function autoClassifyPendingReplies(opts: { limit?: number } = {}): Promise<AutoClassifyResult> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 50))
  // Atomically claim a batch: stamp classified_at under a row lock so two
  // overlapping cron runs never process the same reply. Rows still NULL after
  // 15 min (e.g. a crash mid-run) are reclaimable.
  const pending = (await sql`
    UPDATE outreach_replies SET classified_at = now()
    WHERE id IN (
      SELECT id FROM outreach_replies
      WHERE classification IS NULL
        AND (classified_at IS NULL OR classified_at < now() - interval '15 minutes')
      ORDER BY received_at ASC NULLS LAST
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, user_id, crm_entry_id, in_reply_to_message_id, inbound_text
  `) as any[]

  const res: AutoClassifyResult = {
    considered: pending.length, classified: 0, suppressed: 0, skippedNoFounder: 0, errors: 0,
  }
  const founderCache = new Map<string, FounderCtx | null>()
  const provider = await resolveProvider()
  const generatedBy =
    provider === "anthropic" ? "anthropic:auto" : provider === "ollama" ? "ollama:auto" : "heuristic:auto"

  for (const r of pending) {
    const userId = r.user_id as string | null
    const crmEntryId = r.crm_entry_id as string | null
    if (!userId || !crmEntryId) continue

    // A reply arrived — suppress follow-ups regardless of whether we can classify it.
    await suppressFollowupsOnReply(userId, crmEntryId, r.in_reply_to_message_id).catch(() => {})
    res.suppressed++

    if (!founderCache.has(userId)) {
      founderCache.set(userId, await founderContextForUser(userId).catch(() => null))
    }
    const founder = founderCache.get(userId) ?? null
    if (!founder) { res.skippedNoFounder++; continue }

    const [entry] = (await sql`
      SELECT display_name, display_type, display_title
      FROM crm_entries WHERE id = ${crmEntryId} AND user_id = ${userId} LIMIT 1
    `) as any[]

    let originalDm = ""
    if (r.in_reply_to_message_id) {
      const [m] = (await sql`
        SELECT body FROM outreach_messages
        WHERE id = ${r.in_reply_to_message_id} AND user_id = ${userId} LIMIT 1
      `) as any[]
      if (m) originalDm = m.body ?? ""
    }
    if (!originalDm) {
      const [m] = (await sql`
        SELECT body FROM outreach_messages
        WHERE crm_entry_id = ${crmEntryId} AND user_id = ${userId}
          AND status IN ('sent','delivered','replied')
        ORDER BY sent_at DESC NULLS LAST LIMIT 1
      `) as any[]
      if (m) originalDm = m.body ?? ""
    }

    let result
    try {
      result = await classifyAndDraftReply({
        partnerName: entry?.display_name ?? "there",
        partnerFirm: entry?.display_type ?? "their fund",
        partnerTitle: entry?.display_title ?? undefined,
        ourOriginalDm: originalDm,
        theirReply: r.inbound_text ?? "",
        founder,
      })
    } catch { res.errors++; continue }

    await sql`
      UPDATE outreach_replies SET
        classification    = ${result.classification},
        draft_response    = ${result.draft},
        recommended_stage = ${result.recommendedStage},
        reengage_on       = ${result.reengageOnIso ?? null}::date,
        generated_by      = ${generatedBy},
        notes             = COALESCE(notes, '') || ${" | auto:" + (result.notes ?? "")},
        updated_at        = NOW()
      WHERE id = ${r.id}
    `

    if (result.recommendedStage) {
      await sql`
        UPDATE crm_entries SET
          stage = ${result.recommendedStage},
          last_contacted_at = COALESCE(last_contacted_at, NOW()),
          updated_at = NOW()
        WHERE id = ${crmEntryId} AND user_id = ${userId}
      `
    }
    res.classified++
  }
  return res
}
