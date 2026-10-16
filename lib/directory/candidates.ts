import "server-only"
import { sql } from "@/lib/db"
import { detectFirms, detectPeople, MAX_BLOCK, type Candidate, type PersonGroup } from "./candidates-core"

/**
 * Finds candidate duplicates and stores them for review (docs/architecture/55, E1). It changes no directory data. A pair a person has already decided (distinct, related, same, merged)
 * keeps its decision; an open pair that is no longer found is marked stale.
 */
const CAP = 30_000
const nonAnon = "COALESCE(metadata->>'anonymised', '') <> 'true'"

async function firmCandidates(): Promise<Candidate[]> {
  const firms = (await sql`SELECT id, name, website, source FROM investment_firms WHERE name IS NOT NULL`) as any[]
  const shared = new Map<string, number>()
  const rows = (await sql.unsafe(`SELECT a.firm_id AS fa, b.firm_id AS fb, count(DISTINCT lower(a.email))::int AS n FROM investors a JOIN investors b ON lower(a.email) = lower(b.email) AND a.firm_id < b.firm_id
    WHERE a.email LIKE '%@%' AND a.firm_id IS NOT NULL AND b.firm_id IS NOT NULL GROUP BY 1, 2`, [])) as any[]
  for (const r of rows) shared.set(`${r.fa}\u0000${r.fb}`, Number(r.n))
  return detectFirms(firms.map((f) => ({ id: String(f.id), name: f.name, website: f.website, source: f.source })), shared)
}

async function groups(by: PersonGroup["by"], key: string, extra = ""): Promise<PersonGroup[]> {
  const rows = (await sql.unsafe(`SELECT ${key} AS k, array_agg(id ORDER BY id) AS ids, array_agg(COALESCE(first_name, '')) AS fn, array_agg(COALESCE(last_name, '')) AS ln FROM investors
    WHERE ${nonAnon} ${extra} GROUP BY 1 HAVING count(*) > 1 AND count(*) <= ${MAX_BLOCK} AND ${key} IS NOT NULL`, [])) as any[]
  return rows.map((r) => ({ by, value: String(r.k), rows: (r.ids as string[]).map((id, i) => ({ id, first: r.fn[i] || null, last: r.ln[i] || null })) }))
}

async function personCandidates(): Promise<Candidate[]> {
  const all = [
    ...(await groups("email", "lower(email)", "AND email LIKE '%@%'")),
    ...(await groups("profile", "lower(substring(COALESCE(person_linkedin_url, linkedin_url) from 'linkedin\\.com/in/([^/?#]+)'))", "AND COALESCE(person_linkedin_url, linkedin_url) ILIKE '%linkedin.com/in/%'")),
    ...(await groups("name_firm", "lower(first_name || ' ' || COALESCE(last_name, '')) || '|' || firm_id", "AND firm_id IS NOT NULL AND COALESCE(last_name, '') <> ''")),
  ]
  return detectPeople(all)
}

async function store(kind: "firm" | "person", found: Candidate[], startedAt: string): Promise<{ stored: number; stale: number }> {
  found.sort((x, y) => y.score - x.score)
  const list = found.slice(0, CAP)
  for (let k = 0; k < list.length; k += 1000) {
    const c = list.slice(k, k + 1000)
    await sql`INSERT INTO directory_candidates (kind, a_id, b_id, tier, score, suggest, evidence, status, updated_at)
      SELECT ${kind}, a, b, t, s, g, e::jsonb, 'open', now()
      FROM unnest(${c.map((x) => x.a)}::text[], ${c.map((x) => x.b)}::text[], ${c.map((x) => x.tier)}::text[], ${c.map((x) => x.score)}::int[], ${c.map((x) => x.suggest)}::text[], ${c.map((x) => JSON.stringify(x.evidence))}::text[]) AS d(a, b, t, s, g, e)
      ON CONFLICT (kind, a_id, b_id) DO UPDATE SET tier = EXCLUDED.tier, score = EXCLUDED.score, suggest = EXCLUDED.suggest, evidence = EXCLUDED.evidence, updated_at = now(),
        status = CASE WHEN directory_candidates.status = 'stale' THEN 'open' ELSE directory_candidates.status END`
  }
  const stale = (await sql`UPDATE directory_candidates SET status = 'stale', updated_at = now() WHERE kind = ${kind} AND status = 'open' AND updated_at < ${startedAt}::timestamptz RETURNING id`) as any[]
  return { stored: list.length, stale: stale.length }
}

export async function runDetection(): Promise<{ firms: { found: number; stored: number; stale: number }; people: { found: number; stored: number; stale: number }; ms: number }> {
  const t = Date.now()
  // The database's own clock, so the app's clock cannot make a fresh row look old (or an old one fresh).
  const startedAt = String(((await sql`SELECT clock_timestamp()::text AS t`) as any[])[0].t)
  const f = await firmCandidates(), p = await personCandidates()
  const fs = await store("firm", f, startedAt), ps = await store("person", p, startedAt)
  return { firms: { found: f.length, ...fs }, people: { found: p.length, ...ps }, ms: Date.now() - t }
}
