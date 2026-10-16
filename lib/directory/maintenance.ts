import "server-only"
import { sql } from "@/lib/db"
import { canaryHash, hashKey, identityHashes } from "./identity"
import { PERSON_REFS } from "./person-registry"

/**
 * Directory maintenance (docs/architecture/54, D2): fills identity hashes, applies tombstones, and removes withdrawn sources after their hold.
 * Run by the directory-maintenance cron. Everything here is idempotent and resumable.
 */
export const HOLD_DAYS = 30
export class HashKeyMismatchError extends Error {
  readonly code = "hash_key_mismatch"
  constructor() { super("The hash key in this process differs from the one the directory was hashed with. Refusing to write or compare hashes.") ; this.name = "HashKeyMismatchError" }
}

/**
 * Writes the canary on first use (only the maintenance job does: `create` is true there), and throws unless this process's key produces the same canary.
 * Importers pass create = false, so a laptop with another key can never be the one that defines the canary.
 */
export async function ensureCanary(key = hashKey(), create = true): Promise<void> {
  const want = canaryHash(key)
  if (create) await sql`INSERT INTO directory_hash_meta (k, v) VALUES ('canary', ${want}) ON CONFLICT (k) DO NOTHING`
  const [r] = (await sql`SELECT v FROM directory_hash_meta WHERE k = 'canary'`) as any[]
  if (!r) throw new Error("The directory has not been hashed yet; the maintenance job writes the key check on its first run.")
  if (r.v !== want) throw new HashKeyMismatchError()
}

/** Hashes rows that have none yet, in batches, until the budget (ms) is spent. Returns how many were done and whether any remain. */
export async function fillHashes(opts: { budgetMs?: number; batch?: number; now?: () => number } = {}): Promise<{ hashed: number; more: boolean }> {
  const key = hashKey(); await ensureCanary(key)
  const now = opts.now ?? Date.now, end = now() + (opts.budgetMs ?? 20_000), batch = opts.batch ?? 1000
  let hashed = 0
  for (;;) {
    const rows = (await sql`SELECT id, email, linkedin_url, person_linkedin_url FROM investors WHERE hashed_at IS NULL ORDER BY id LIMIT ${batch}`) as any[]
    if (!rows.length) return { hashed, more: false }
    const ids: string[] = [], emails: (string | null)[] = [], lis: string[] = []
    for (const r of rows) {
      const h = identityHashes({ email: r.email, linkedinUrl: r.linkedin_url, personLinkedinUrl: r.person_linkedin_url }, key)
      ids.push(r.id); emails.push(h.emailHash); lis.push(JSON.stringify(h.linkedinHashes))
    }
    await sql`UPDATE investors i SET email_hash = d.e, linkedin_hashes = CASE WHEN jsonb_array_length(d.l::jsonb) = 0 THEN NULL ELSE ARRAY(SELECT jsonb_array_elements_text(d.l::jsonb)) END, hashed_at = now()
      FROM unnest(${ids}::text[], ${emails}::text[], ${lis}::text[]) AS d(id, e, l) WHERE i.id = d.id`
    hashed += rows.length
    if (now() >= end) return { hashed, more: true }
  }
}

export interface Probe { email?: string | null; linkedinUrl?: string | null; personLinkedinUrl?: string | null; source?: string | null }

/** Whether this person is tombstoned (for this source, when the tombstone is source-scoped). Used by importers before they insert. Fails closed when the key differs. */
export async function isTombstoned(p: Probe): Promise<boolean> {
  const key = hashKey(); await ensureCanary(key, false)
  const h = identityHashes({ email: p.email ?? null, linkedinUrl: p.linkedinUrl, personLinkedinUrl: p.personLinkedinUrl }, key)
  if (!h.emailHash && !h.linkedinHashes.length) return false
  const src = (p.source ?? "").trim() || "unknown"
  const [r] = (await sql`SELECT 1 AS hit FROM directory_tombstones t
    WHERE (t.expires_at IS NULL OR t.expires_at > now()) AND (t.source IS NULL OR t.source = ${src})
      AND ((${h.emailHash}::text IS NOT NULL AND t.email_hash = ${h.emailHash}) OR (t.linkedin_hash IS NOT NULL AND t.linkedin_hash = ANY(${h.linkedinHashes}::text[]))) LIMIT 1`) as any[]
  return !!r
}

/** Every table that holds an investor id, from the registry (lib/directory/person-registry.ts). */
export const INVESTOR_REFS: Array<[string, string]> = PERSON_REFS.map((r) => [r.table, r.column])
const NOT_REFERENCED = INVESTOR_REFS.map(([t, c]) => `NOT EXISTS (SELECT 1 FROM ${t} x WHERE x.${c}::text = i.id)`).join(" AND ")

/** Removes the rows that are derived from these people (match results, signals, links). Throws on failure: an erasure must not report success with these left behind. */
export async function deleteDerived(ids: string[]): Promise<number> {
  let n = 0
  for (const r of PERSON_REFS.filter((x) => x.fate === "delete")) {
    const del = (await sql.unsafe(`DELETE FROM ${r.table} WHERE ${r.column}::text = ANY($1::text[]) RETURNING 1`, [ids])) as any[]
    n += del.length
  }
  return n
}

/** Removes the people with these ids: derived rows go first, then the person is deleted when nothing refers to them, otherwise their personal data is cleared and the row kept as an inactive shell. */
export async function eraseRows(ids: string[]): Promise<{ deleted: number; anonymised: number }> {
  let deleted = 0, anonymised = 0
  for (let k = 0; k < ids.length; k += 500) {
    const chunk = ids.slice(k, k + 500)
    await deleteDerived(chunk)
    let free: string[] = []
    try { free = ((await sql.unsafe(`SELECT i.id FROM investors i WHERE i.id = ANY($1::text[]) AND ${NOT_REFERENCED}`, [chunk])) as any[]).map((r) => r.id) } catch { free = [] }
    if (free.length) { await sql`DELETE FROM investors WHERE id = ANY(${free}::text[])`; deleted += free.length }
    const keep = chunk.filter((id) => !free.includes(id))
    if (keep.length) {
      await sql`UPDATE investors SET first_name = 'Removed', last_name = NULL, title = NULL, email = NULL, phone = NULL, linkedin_url = NULL, person_linkedin_url = NULL, twitter_url = NULL, avatar = NULL,
        bio = NULL, address = NULL, folk_id = NULL, folk_custom_fields = NULL, investment_thesis = NULL, recent_investments = NULL, embedding = NULL, metadata = '{"anonymised":true}'::jsonb,
        status = 'removed', is_active = false, email_hash = NULL, linkedin_hashes = NULL, hashed_at = now(), updated_at = now() WHERE id = ANY(${keep}::text[])`
      anonymised += keep.length
    }
  }
  return { deleted, anonymised }
}

/** Removes rows that match a tombstone (any writer path may have re-added them). Hashes first, so new rows are included. */
export async function sweepTombstoned(): Promise<{ removed: number; deleted: number; anonymised: number }> {
  const rows = (await sql`SELECT i.id FROM investors i WHERE COALESCE(i.metadata->>'anonymised', '') <> 'true' AND EXISTS (
      SELECT 1 FROM directory_tombstones t WHERE (t.expires_at IS NULL OR t.expires_at > now()) AND (t.source IS NULL OR t.source = COALESCE(NULLIF(TRIM(i.source), ''), 'unknown'))
        AND ((t.email_hash IS NOT NULL AND t.email_hash = i.email_hash) OR (t.linkedin_hash IS NOT NULL AND i.linkedin_hashes IS NOT NULL AND i.linkedin_hashes @> ARRAY[t.linkedin_hash])))`) as any[]
  const r = await eraseRows(rows.map((x) => x.id))
  return { removed: rows.length, ...r }
}

/** Withdrawn sources past their hold: tombstone each person (for that source only), then delete or anonymise the rows. Firms are left (a company is not a person). */
export async function purgeWithdrawn(): Promise<Array<{ source: string; people: number; tombstones: number; deleted: number; anonymised: number }>> {
  const key = hashKey(); await ensureCanary(key)
  const due = (await sql`SELECT source FROM directory_sources WHERE status = 'withdrawn' AND purged_at IS NULL AND withdrawn_at <= now() - make_interval(days => ${HOLD_DAYS})`) as any[]
  const out = []
  for (const { source } of due) {
    // Every person of the source must be hashed before they are tombstoned.
    for (let guard = 0; guard < 1000; guard++) { const f = await fillHashes({ budgetMs: 60_000 }); if (!f.more) break }
    const rows = (await sql`SELECT id, email_hash, linkedin_hashes FROM investors WHERE COALESCE(NULLIF(TRIM(source), ''), 'unknown') = ${source} AND COALESCE(metadata->>'anonymised', '') <> 'true'`) as any[]
    const emails = [...new Set(rows.map((r) => r.email_hash).filter(Boolean))] as string[]
    const lis = [...new Set(rows.flatMap((r) => r.linkedin_hashes ?? []))] as string[]
    let tombstones = 0
    for (let k = 0; k < emails.length; k += 1000) {
      const x = (await sql`INSERT INTO directory_tombstones (email_hash, source, reason) SELECT h, ${source}, 'batch_withdrawn' FROM unnest(${emails.slice(k, k + 1000)}::text[]) h ON CONFLICT DO NOTHING RETURNING id`) as any[]
      tombstones += x.length
    }
    for (let k = 0; k < lis.length; k += 1000) {
      const x = (await sql`INSERT INTO directory_tombstones (linkedin_hash, source, reason) SELECT h, ${source}, 'batch_withdrawn' FROM unnest(${lis.slice(k, k + 1000)}::text[]) h ON CONFLICT DO NOTHING RETURNING id`) as any[]
      tombstones += x.length
    }
    const er = await eraseRows(rows.map((r) => r.id))
    await sql`UPDATE directory_sources SET purged_at = now(), updated_at = now() WHERE source = ${source}`
    out.push({ source, people: rows.length, tombstones, ...er })
  }
  return out
}

/** Columns in the live schema that hold a directory person's id but are not in the registry. Reported by the job so a new table is noticed within the hour. */
export async function unclassifiedPersonRefs(): Promise<string[]> {
  const rows = (await sql.unsafe(`SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name ~ 'investor_id$'`, [])) as any[]
  const known = new Set(PERSON_REFS.map((r) => `${r.table}.${r.column}`))
  return rows.map((r) => `${r.table_name}.${r.column_name}`).filter((x) => !known.has(x)).sort()
}

/** People nobody has touched for 36 months and no workspace refers to: reported, never deleted by the job (docs/architecture/54 section 8). */
export async function staleCount(): Promise<number> {
  const rows = (await sql.unsafe(`SELECT count(*)::int AS n FROM investors i WHERE COALESCE(i.updated_at, i.created_at) < now() - interval '36 months' AND COALESCE(i.metadata->>'anonymised', '') <> 'true' AND ${NOT_REFERENCED}`, [])) as any[]
  return Number(rows[0]?.n ?? 0)
}

export async function runMaintenance(opts: { budgetMs?: number } = {}) {
  const hashes = await fillHashes({ budgetMs: opts.budgetMs ?? 150_000 })
  const sweep = hashes.more ? null : await sweepTombstoned()
  const purged = hashes.more ? [] : await purgeWithdrawn()
  // Privacy requests: expire unconfirmed ones, wipe closed ones, and nudge when one is due. Never lets a failure here stop the directory work above.
  let requests: unknown = null
  try { const dsar = await import("@/lib/privacy/dsar"); requests = { ...(await dsar.expireRequests()), digest: await dsar.dueDigest() } } catch { /* the table may not exist yet */ }
  let review: unknown = null
  try { review = { unclassifiedPersonRefs: await unclassifiedPersonRefs(), stale36Months: await staleCount() } } catch { /* reporting only */ }
  return { hashes, sweep, purged, requests, review }
}
