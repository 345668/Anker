/**
 * Notifications store (server-only) — create / list / mark-read over the
 * `notifications` table (scripts/migrations/2026-08-23-notifications.sql).
 *
 * `createNotification` is idempotent when a `dedupeKey` is given: the unique
 * (user_id, dedupe_key) index turns a re-run of the deadline scanner into a
 * no-op instead of a duplicate. Read paths degrade to empty on any DB error
 * (e.g. table not migrated yet) so the header bell never breaks the shell.
 */
import "server-only"
import { sql } from "@/lib/db"

export type NotificationSeverity = "info" | "warning" | "urgent"

export interface NotificationRow {
  id: string
  user_id: string
  org_id: string | null
  kind: string
  severity: NotificationSeverity
  title: string
  body: string | null
  href: string | null
  dedupe_key: string | null
  read_at: string | null
  created_at: string
}

export interface CreateNotificationInput {
  userId: string
  orgId?: string | null
  kind: string
  severity?: NotificationSeverity
  title: string
  body?: string | null
  href?: string | null
  /** Idempotency key — one notification per (userId, dedupeKey). */
  dedupeKey?: string | null
}

/** Insert a notification. With a dedupeKey, a duplicate is silently skipped.
 *  Returns whether a new row was created. */
export async function createNotification(input: CreateNotificationInput): Promise<{ created: boolean }> {
  const rows = await sql`
    INSERT INTO notifications (user_id, org_id, kind, severity, title, body, href, dedupe_key)
    VALUES (${input.userId}, ${input.orgId ?? null}, ${input.kind}, ${input.severity ?? "info"},
            ${input.title}, ${input.body ?? null}, ${input.href ?? null}, ${input.dedupeKey ?? null})
    ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
    RETURNING id` as { id: string }[]
  return { created: rows.length > 0 }
}

export async function listNotifications(
  userId: string,
  opts: { limit?: number; unreadOnly?: boolean } = {},
): Promise<NotificationRow[]> {
  const limit = Math.max(1, Math.min(100, opts.limit ?? 30))
  try {
    return opts.unreadOnly
      ? await sql`SELECT * FROM notifications WHERE user_id = ${userId} AND read_at IS NULL
                  ORDER BY created_at DESC LIMIT ${limit}` as NotificationRow[]
      : await sql`SELECT * FROM notifications WHERE user_id = ${userId}
                  ORDER BY created_at DESC LIMIT ${limit}` as NotificationRow[]
  } catch {
    return [] // table not migrated / DB hiccup — never break the shell
  }
}

export async function unreadCount(userId: string): Promise<number> {
  try {
    const rows = await sql`SELECT count(*)::int AS n FROM notifications WHERE user_id = ${userId} AND read_at IS NULL` as { n: number }[]
    return rows[0]?.n ?? 0
  } catch {
    return 0
  }
}

/** Mark one (by id) or all of a user's notifications read. Returns rows affected. */
export async function markRead(userId: string, opts: { id?: string; all?: boolean }): Promise<number> {
  if (opts.all) {
    const rows = await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND read_at IS NULL RETURNING id` as { id: string }[]
    return rows.length
  }
  if (opts.id) {
    const rows = await sql`UPDATE notifications SET read_at = now() WHERE user_id = ${userId} AND id = ${opts.id} AND read_at IS NULL RETURNING id` as { id: string }[]
    return rows.length
  }
  return 0
}
