/**
 * Compliance — the do-not-contact (suppression) list.
 *
 * A suppressed person is never enqueued: the sequencer stops any member whose
 * profile is on the list. Entries are added manually or automatically when a
 * reply reads like an opt-out ("stop", "unsubscribe", "not interested", …).
 */
import "server-only"
import { sql } from "@/lib/db"
import { normalizeProfileUrl } from "./inbox"

export interface Suppression {
  id: string
  slug: string
  targetUrl: string | null
  reason: string | null
  createdAt: string
}

const rowToSuppression = (r: any): Suppression => ({
  id: r.id, slug: r.slug, targetUrl: r.target_url ?? null, reason: r.reason ?? null, createdAt: r.created_at,
})

/** Opt-out phrases that auto-suppress a replying contact. */
const OPT_OUT_RE = /\b(stop|unsubscribe|opt[\s-]?out|remove me|take me off|not interested|no thanks|leave me alone|do not contact)\b/i

export function isOptOut(text: string | null | undefined): boolean {
  return !!text && OPT_OUT_RE.test(text)
}

export async function listSuppressions(userId: string): Promise<Suppression[]> {
  const rows = (await sql`SELECT * FROM li_suppressions WHERE user_id = ${userId} ORDER BY created_at DESC`) as any[]
  return rows.map(rowToSuppression)
}

/** The set of suppressed /in/ slugs for a user (for fast membership checks). */
export async function suppressedSlugs(userId: string): Promise<Set<string>> {
  const rows = (await sql`SELECT slug FROM li_suppressions WHERE user_id = ${userId}`) as any[]
  return new Set(rows.map((r) => String(r.slug)))
}

/** Add one or more people to the do-not-contact list. Idempotent. Returns count added. */
export async function addSuppressions(
  userId: string,
  people: { url: string; reason?: string }[],
): Promise<number> {
  let added = 0
  for (const p of people) {
    const slug = normalizeProfileUrl(p.url)
    if (!slug) continue
    const rows = (await sql`
      INSERT INTO li_suppressions (user_id, slug, target_url, reason)
      VALUES (${userId}, ${slug}, ${p.url}, ${p.reason ?? "manual"})
      ON CONFLICT (user_id, slug) DO NOTHING
      RETURNING id
    `) as any[]
    if (rows.length) added++
  }
  return added
}

export async function removeSuppression(userId: string, id: string): Promise<boolean> {
  const rows = (await sql`DELETE FROM li_suppressions WHERE id = ${id} AND user_id = ${userId} RETURNING id`) as any[]
  return rows.length > 0
}
