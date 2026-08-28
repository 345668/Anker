/**
 * Unibox — synced LinkedIn conversations + messages (Phase 3).
 *
 * The extension scrapes the member's LinkedIn inbox and posts threads here.
 * Beyond powering the Unibox UI, an inbound message on a thread we can match to
 * an active campaign member flips that member to 'replied' — the sequencer's
 * first real signal, so it stops messaging people who answered.
 */
import "server-only"
import { sql } from "@/lib/db"
import {
  rowToConversation, rowToMessage,
  type LiConversation, type LiMessage, type MessageDirection,
} from "./types"

/** Reduce a LinkedIn profile URL to a stable `/in/<slug>` key for matching. */
export function normalizeProfileUrl(url: string | null | undefined): string | null {
  if (!url) return null
  const m = String(url).match(/linkedin\.com\/in\/([^/?#]+)/i)
  return m ? `in/${decodeURIComponent(m[1]).toLowerCase()}` : null
}

export interface IngestMessage {
  direction: MessageDirection
  body: string
  sentAt?: string | null
  externalId?: string | null
}

export interface IngestThread {
  threadUrn?: string | null
  participantUrl?: string | null
  participantName?: string | null
  unread?: boolean
  lastMessageAt?: string | null
  lastMessageText?: string | null
  lastDirection?: MessageDirection | null
  senderId?: string | null
  messages?: IngestMessage[]
}

export interface IngestResult { conversations: number; messages: number; repliesDetected: number }

/**
 * Upsert synced threads. Idempotent on (user_id, thread_urn) and
 * (conversation_id, external_id). Returns counts + how many active members were
 * flipped to 'replied' by an inbound message.
 */
export async function ingestThreads(userId: string, threads: IngestThread[]): Promise<IngestResult> {
  const out: IngestResult = { conversations: 0, messages: 0, repliesDetected: 0 }
  if (!Array.isArray(threads) || !threads.length) return out

  // Pre-load this user's active members for participant → member matching.
  const memberRows = (await sql`
    SELECT id, campaign_id, target_url, state FROM li_campaign_members WHERE user_id = ${userId}
  `) as any[]
  const memberByKey = new Map<string, { id: string; campaignId: string; state: string }>()
  for (const r of memberRows) {
    const key = normalizeProfileUrl(r.target_url)
    if (key) memberByKey.set(key, { id: r.id, campaignId: r.campaign_id, state: r.state })
  }

  for (const t of threads) {
    const threadUrn = t.threadUrn || t.participantUrl || null
    if (!threadUrn) continue
    const key = normalizeProfileUrl(t.participantUrl)
    const match = key ? memberByKey.get(key) : undefined
    const lastDir = t.lastDirection ?? (t.messages?.length ? t.messages[t.messages.length - 1].direction : null)

    const convRows = (await sql`
      INSERT INTO li_conversations
        (user_id, sender_id, thread_urn, participant_url, participant_name,
         campaign_id, member_id, last_message_at, last_message_text, last_direction, unread)
      VALUES
        (${userId}, ${t.senderId ?? null}, ${threadUrn}, ${t.participantUrl ?? null}, ${t.participantName ?? null},
         ${match?.campaignId ?? null}, ${match?.id ?? null}, ${t.lastMessageAt ?? null},
         ${t.lastMessageText ?? null}, ${lastDir}, ${t.unread === true})
      ON CONFLICT (user_id, thread_urn) DO UPDATE SET
        participant_name = COALESCE(EXCLUDED.participant_name, li_conversations.participant_name),
        participant_url  = COALESCE(EXCLUDED.participant_url, li_conversations.participant_url),
        member_id        = COALESCE(EXCLUDED.member_id, li_conversations.member_id),
        campaign_id      = COALESCE(EXCLUDED.campaign_id, li_conversations.campaign_id),
        last_message_at  = COALESCE(EXCLUDED.last_message_at, li_conversations.last_message_at),
        last_message_text = COALESCE(EXCLUDED.last_message_text, li_conversations.last_message_text),
        last_direction   = COALESCE(EXCLUDED.last_direction, li_conversations.last_direction),
        unread           = EXCLUDED.unread,
        updated_at       = now()
      RETURNING id
    `) as any[]
    const conversationId = convRows[0]?.id
    if (!conversationId) continue
    out.conversations++

    // Messages: explicit list if provided, else synthesize one from the snippet.
    const msgs: IngestMessage[] = t.messages?.length
      ? t.messages
      : t.lastMessageText
        ? [{ direction: lastDir ?? "inbound", body: t.lastMessageText, sentAt: t.lastMessageAt ?? null, externalId: t.threadUrn ? `${t.threadUrn}:last` : null }]
        : []
    for (const m of msgs) {
      const ins = (await sql`
        INSERT INTO li_messages (conversation_id, user_id, direction, body, sent_at, external_id)
        VALUES (${conversationId}, ${userId}, ${m.direction}, ${String(m.body ?? "")}, ${m.sentAt ?? null}, ${m.externalId ?? null})
        ON CONFLICT (conversation_id, external_id) DO NOTHING
        RETURNING id
      `) as any[]
      if (ins.length) out.messages++
    }

    // Reply-stop: an inbound last message on an active member's thread stops it.
    if (lastDir === "inbound" && match && match.state === "active") {
      const upd = (await sql`
        UPDATE li_campaign_members SET state = 'replied', updated_at = now()
        WHERE id = ${match.id} AND user_id = ${userId} AND state = 'active'
        RETURNING id
      `) as any[]
      if (upd.length) out.repliesDetected++
    }
  }
  return out
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function listConversations(
  userId: string,
  opts: { unreadOnly?: boolean; campaignId?: string; limit?: number } = {},
): Promise<LiConversation[]> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? 100))
  const rows = (await sql`
    SELECT * FROM li_conversations
    WHERE user_id = ${userId}
      AND (${opts.unreadOnly ? true : false} = false OR unread = true)
      AND (${opts.campaignId ?? null}::text IS NULL OR campaign_id = ${opts.campaignId ?? null})
    ORDER BY last_message_at DESC NULLS LAST
    LIMIT ${limit}
  `) as any[]
  return rows.map(rowToConversation)
}

export async function getConversation(
  userId: string,
  id: string,
): Promise<{ conversation: LiConversation; messages: LiMessage[] } | null> {
  const rows = (await sql`SELECT * FROM li_conversations WHERE id = ${id} AND user_id = ${userId} LIMIT 1`) as any[]
  if (!rows.length) return null
  const messages = (await sql`
    SELECT * FROM li_messages WHERE conversation_id = ${id} ORDER BY sent_at NULLS FIRST, created_at
  `) as any[]
  return { conversation: rowToConversation(rows[0]), messages: messages.map(rowToMessage) }
}

/** Mark a conversation read/unread (local state; does not touch LinkedIn). */
export async function setConversationRead(userId: string, id: string, unread: boolean): Promise<boolean> {
  const rows = (await sql`
    UPDATE li_conversations SET unread = ${unread}, updated_at = now()
    WHERE id = ${id} AND user_id = ${userId} RETURNING id
  `) as any[]
  return rows.length > 0
}

export async function inboxCounts(userId: string): Promise<{ total: number; unread: number }> {
  const rows = (await sql`
    SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE unread)::int AS unread
    FROM li_conversations WHERE user_id = ${userId}
  `) as any[]
  return { total: Number(rows[0]?.total ?? 0), unread: Number(rows[0]?.unread ?? 0) }
}
