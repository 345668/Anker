/**
 * One do-not-contact registry across channels (docs/architecture/37 section 8.2, 8.3).
 *
 * An unsubscribe, a spam complaint or an objection must stop contact on EVERY channel, not only the one it arrived on.
 * Email keeps its global rows in `email_suppressions` (user_id NULL); LinkedIn keeps global rows in `li_suppressions`
 * under the owner `*`. The same person is joined across channels through the records Anker already holds
 * (the directory, CRM people, contacts): an email address maps to LinkedIn profiles and the other way round.
 *
 * What counts: an unsubscribe, a complaint and an explicit objection ("stop", "do not contact", "remove me") are global.
 * A weak signal ("not interested") stays with the one sender who received it. A bounce is a dead address, not an
 * objection, so it suppresses that address only.
 */
import "server-only"
import { sql } from "@/lib/db"
import { suppressGlobally, normEmail } from "@/lib/email/unsubscribe"

export const GLOBAL_LI_OWNER = "*"

/** The in/<slug> key used by li_suppressions. */
export function profileSlug(url: string | null | undefined): string | null {
  const m = String(url ?? "").match(/linkedin\.com\/in\/([^/?#]+)/i)
  if (!m) return null
  try { return `in/${decodeURIComponent(m[1]).toLowerCase()}` } catch { return `in/${m[1].toLowerCase()}` }
}

/** Explicit objections only. "not interested" and "no thanks" are deliberately absent. */
const OBJECTION_RE = /\b(stop|unsubscribe|opt[\s-]?out|remove me|take me off|leave me alone|do not contact|don'?t contact)\b/i
export const isObjection = (text: string | null | undefined): boolean => !!text && OBJECTION_RE.test(text)

export interface Identity { emails: Set<string>; slugs: Set<string>; urls: Map<string, string> }

const safe = async (run: () => Promise<unknown>): Promise<any[]> => { try { return (await run()) as any[] } catch { return [] } }

/** Everything Anker knows that is the same person as this email address and/or LinkedIn profile. */
export async function resolveIdentity(i: { email?: string | null; linkedinUrl?: string | null }): Promise<Identity> {
  const emails = new Set<string>(); const slugs = new Set<string>(); const urls = new Map<string, string>()
  const e = i.email ? normEmail(i.email) : ""
  const s = profileSlug(i.linkedinUrl)
  if (e) emails.add(e)
  if (s && i.linkedinUrl) { slugs.add(s); urls.set(s, i.linkedinUrl) }
  const take = (r: any) => {
    if (r.email) emails.add(normEmail(String(r.email)))
    for (const u of [r.l1, r.l2]) {
      const sl = profileSlug(u)
      if (sl && u) { slugs.add(sl); if (!urls.has(sl)) urls.set(sl, String(u)) }
    }
  }
  const like = s ? `%linkedin.com/in/${s.slice(3)}%` : null
  const rows: any[] = []
  if (e) {
    rows.push(...await safe(() => sql`SELECT email, linkedin_url AS l1, person_linkedin_url AS l2 FROM investors WHERE lower(email) = ${e}`))
    rows.push(...await safe(() => sql`SELECT email, linkedin AS l1, NULL AS l2 FROM crm_people WHERE lower(email) = ${e}`))
    rows.push(...await safe(() => sql`SELECT email, linkedin_url AS l1, NULL AS l2 FROM contacts WHERE lower(email) = ${e}`))
  }
  if (like) {
    rows.push(...await safe(() => sql`SELECT email, linkedin_url AS l1, person_linkedin_url AS l2 FROM investors WHERE lower(linkedin_url) LIKE ${like} OR lower(person_linkedin_url) LIKE ${like}`))
    rows.push(...await safe(() => sql`SELECT email, linkedin AS l1, NULL AS l2 FROM crm_people WHERE lower(linkedin) LIKE ${like}`))
    rows.push(...await safe(() => sql`SELECT email, linkedin_url AS l1, NULL AS l2 FROM contacts WHERE lower(linkedin_url) LIKE ${like}`))
  }
  rows.forEach(take)
  return { emails, slugs, urls }
}

/** Suppress a person on every channel. Idempotent. Returns how many addresses and profiles are now covered. */
export async function suppressEverywhere(i: { email?: string | null; linkedinUrl?: string | null; reason: string; source: string }): Promise<{ emails: number; linkedin: number }> {
  const id = await resolveIdentity(i)
  for (const e of id.emails) await suppressGlobally(e, i.reason, i.source)
  let linkedin = 0
  for (const slug of id.slugs) {
    try {
      await sql`INSERT INTO li_suppressions (user_id, slug, target_url, reason) VALUES (${GLOBAL_LI_OWNER}, ${slug}, ${id.urls.get(slug) ?? null}, ${i.reason})
        ON CONFLICT (user_id, slug) DO NOTHING`
      linkedin++
    } catch { /* table absent in some environments */ }
  }
  return { emails: id.emails.size, linkedin }
}
