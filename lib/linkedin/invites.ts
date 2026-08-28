/**
 * Connection-acceptance signal.
 *
 * The extension scrapes the member's "Sent invitations" view and reports which
 * invitees have accepted. We match those profile URLs to active campaign members
 * and stamp accepted_at — which powers the funnel's "accepted" metric and lets
 * the sequencer honour 'if_accepted' steps.
 */
import "server-only"
import { sql } from "@/lib/db"
import { normalizeProfileUrl } from "./inbox"

/**
 * Mark campaign members accepted from a list of accepted profile URLs.
 * Idempotent: only sets accepted_at where it's still null. Returns how many
 * members were newly marked accepted.
 */
export async function recordAcceptances(userId: string, acceptedUrls: string[]): Promise<number> {
  const keys = Array.from(
    new Set(acceptedUrls.map((u) => normalizeProfileUrl(u)).filter((k): k is string => !!k)),
  )
  if (!keys.length) return 0

  // Load this user's members that don't yet have an acceptance, key by /in/ slug.
  const rows = (await sql`
    SELECT id, target_url FROM li_campaign_members
    WHERE user_id = ${userId} AND accepted_at IS NULL
  `) as any[]
  const idsToMark: string[] = []
  for (const r of rows) {
    const k = normalizeProfileUrl(r.target_url)
    if (k && keys.includes(k)) idsToMark.push(r.id)
  }
  if (!idsToMark.length) return 0

  const marked = (await sql`
    UPDATE li_campaign_members
    SET accepted_at = now(), updated_at = now()
    WHERE user_id = ${userId} AND id = ANY(${idsToMark}::text[]) AND accepted_at IS NULL
    RETURNING id
  `) as any[]
  return marked.length
}

/**
 * Infer acceptances from the "still pending" set: a member we sent a connect to
 * (a completed connect_request action) who is NO LONGER in the pending list has
 * accepted. Caveat: an invite also leaves "pending" if withdrawn/expired, so
 * this is a best-effort signal — good enough to advance if_accepted, and it's
 * only applied to members whose connect actually completed. Returns count marked.
 */
export async function markAcceptedFromPending(userId: string, pendingUrls: string[]): Promise<number> {
  const pendingKeys = new Set(
    pendingUrls.map((u) => normalizeProfileUrl(u)).filter((k): k is string => !!k),
  )
  const rows = (await sql`
    SELECT DISTINCT m.id, m.target_url
    FROM li_campaign_members m
    JOIN li_action_queue a
      ON a.member_id = m.id AND a.action_type = 'connect_request' AND a.status = 'done'
    WHERE m.user_id = ${userId} AND m.accepted_at IS NULL
  `) as any[]
  const toMark = rows
    .filter((r) => { const k = normalizeProfileUrl(r.target_url); return k && !pendingKeys.has(k) })
    .map((r) => r.id)
  if (!toMark.length) return 0

  const marked = (await sql`
    UPDATE li_campaign_members SET accepted_at = now(), updated_at = now()
    WHERE user_id = ${userId} AND id = ANY(${toMark}::text[]) AND accepted_at IS NULL
    RETURNING id
  `) as any[]
  return marked.length
}
