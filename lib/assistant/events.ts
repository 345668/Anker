import { sql } from "@/lib/db"

/**
 * The assistant conversation log.
 * Doc: docs/architecture/28-assistant-system-design.md §3, phase 3.
 *
 * `anker_chats.messages` is the projection; this is the record. The log makes
 * intent durable *before* the work happens, which is what lets a run be resumed,
 * explained afterwards, or parked awaiting a human — none of which a single jsonb
 * blob can do.
 *
 * Append-only by database trigger. There is no update and no delete here on
 * purpose: a correction is a new event. The one exception is deleting the whole
 * conversation, which cascades (see the migration's comment on why that is not a
 * loophole).
 */

export type ChatEventKind =
  | "chat.created"
  | "message.user"
  | "model.requested"
  | "model.completed"
  | "tool.requested"
  | "tool.completed"
  | "tool.failed"
  | "approval.granted"
  | "approval.denied"
  | "message.assistant"
  | "run.ended"

export interface ChatEvent {
  id: number
  chatId: string
  scopeKey: string | null
  seq: number
  kind: ChatEventKind
  payload: Record<string, any>
  awaiting: boolean
  createdBy: string | null
  createdAt: string
}

export interface AppendEvent {
  kind: ChatEventKind
  payload?: Record<string, any>
  awaiting?: boolean
}

const iso = (v: unknown): string => {
  try { return new Date(v as string).toISOString() } catch { return new Date(0).toISOString() }
}

const toEvent = (r: any): ChatEvent => ({
  id: Number(r.id),
  chatId: r.chat_id,
  scopeKey: r.scope_key ?? null,
  seq: Number(r.seq),
  kind: r.kind,
  payload: r.payload ?? {},
  awaiting: !!r.awaiting,
  createdBy: r.created_by ?? null,
  createdAt: iso(r.created_at),
})

/**
 * Append events to a conversation, continuing its sequence.
 *
 * `seq` is allocated from the current maximum in the same statement rather than
 * read-then-written, so two concurrent appends collide on the unique index
 * instead of silently interleaving. The caller retries; the log never ends up
 * with two events claiming the same position.
 */
export async function appendEvents(
  chatId: string,
  actorId: string | null,
  events: AppendEvent[],
): Promise<ChatEvent[]> {
  if (!events.length) return []
  const payload = JSON.stringify(
    events.map((e, i) => ({
      i,
      kind: e.kind,
      payload: e.payload ?? {},
      awaiting: e.awaiting ?? false,
    })),
  )
  const rows = await sql`
    WITH next AS (
      SELECT COALESCE(MAX(seq), -1) + 1 AS base FROM anker_chat_events WHERE chat_id = ${chatId}
    )
    INSERT INTO anker_chat_events (chat_id, seq, kind, payload, awaiting, created_by)
    SELECT ${chatId}, next.base + (e->>'i')::int, e->>'kind',
           COALESCE(e->'payload', '{}'::jsonb), COALESCE((e->>'awaiting')::boolean, false), ${actorId}
      FROM next, jsonb_array_elements(${payload}::jsonb) AS e
    RETURNING id, chat_id, scope_key, seq, kind, payload, awaiting, created_by, created_at
  `
  return (rows as any[]).map(toEvent)
}

/** The whole conversation, oldest first. */
export async function readEvents(chatId: string, scopeKey: string): Promise<ChatEvent[]> {
  const rows = await sql`
    SELECT id, chat_id, scope_key, seq, kind, payload, awaiting, created_by, created_at
      FROM anker_chat_events
     WHERE chat_id = ${chatId} AND scope_key IS NOT DISTINCT FROM ${scopeKey}
     ORDER BY seq ASC
  `
  return (rows as any[]).map(toEvent)
}

/** Events after a position, for a client resuming a dropped stream. */
export async function readEventsSince(chatId: string, scopeKey: string, afterSeq: number): Promise<ChatEvent[]> {
  const rows = await sql`
    SELECT id, chat_id, scope_key, seq, kind, payload, awaiting, created_by, created_at
      FROM anker_chat_events
     WHERE chat_id = ${chatId} AND scope_key IS NOT DISTINCT FROM ${scopeKey} AND seq > ${afterSeq}
     ORDER BY seq ASC
  `
  return (rows as any[]).map(toEvent)
}

export interface ProjectedMessage {
  role: "user" | "assistant"
  content: string
  tools?: { name: string; observation?: string; error?: string }[]
}

/**
 * Derive the conversation from its log — the projection `anker_chats.messages`
 * holds.
 *
 * Tool activity is attached to the assistant turn that follows it, which is how
 * the UI already renders it. A `tool.requested` still awaiting a human produces
 * no message: nothing happened yet, and showing it as a completed step would
 * claim an action that has not been taken.
 */
export function projectMessages(events: ChatEvent[]): ProjectedMessage[] {
  const out: ProjectedMessage[] = []
  let pending: { name: string; observation?: string; error?: string }[] = []

  for (const e of events) {
    switch (e.kind) {
      case "message.user":
        if (pending.length) pending = []
        out.push({ role: "user", content: String(e.payload.content ?? "") })
        break
      case "tool.completed":
        pending.push({ name: String(e.payload.name ?? ""), observation: e.payload.observation })
        break
      case "tool.failed":
        pending.push({ name: String(e.payload.name ?? ""), error: e.payload.error })
        break
      case "message.assistant":
        out.push({
          role: "assistant",
          content: String(e.payload.content ?? ""),
          ...(pending.length ? { tools: pending } : {}),
        })
        pending = []
        break
      default:
        break
    }
  }
  return out
}

/** Intents parked for a human, across a workspace. Doc 28 §7. */
export async function awaitingApproval(scopeKey: string): Promise<ChatEvent[]> {
  const rows = await sql`
    SELECT id, chat_id, scope_key, seq, kind, payload, awaiting, created_by, created_at
      FROM anker_chat_events
     WHERE scope_key = ${scopeKey} AND awaiting
       AND NOT EXISTS (
         SELECT 1 FROM anker_chat_events r
          WHERE r.chat_id = anker_chat_events.chat_id
            AND r.kind IN ('approval.granted','approval.denied')
            AND (r.payload->>'event_id')::bigint = anker_chat_events.id
       )
     ORDER BY created_at ASC
  `
  return (rows as any[]).map(toEvent)
}
