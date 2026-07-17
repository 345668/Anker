/**
 * LP Portal — magic-link tokens + per-LP scoped data.
 *
 * mintPortalToken → returns the plaintext token ONCE (only the hash is
 * stored). verifyPortalToken resolves a token to its LP (checking expiry +
 * revocation, stamping last_seen). getPortalData assembles exactly what one
 * LP may see: their capital position history, published quarterly letters,
 * and fund documents. Nothing crosses LP boundaries.
 *
 * Feature adapted from Hemrock Portfolio Reporting (Apache-2.0); see NOTICE.
 */
import { sql } from "@/lib/db"
import { randomBytes, createHash } from "node:crypto"

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex")

export interface PortalLp {
  lpId: string
  fundId: string
  lpName: string
  fundName: string | null
  tokenId: string
}

/** Mint a portal token for an LP. Returns the plaintext ONCE. */
export async function mintPortalToken(
  lpId: string, fundId: string, opts: { days?: number; label?: string; createdBy?: string } = {},
): Promise<{ token: string; prefix: string; expiresAt: string | null }> {
  const token = "lp_" + randomBytes(24).toString("base64url")
  const prefix = token.slice(0, 10)
  const expiresAt = opts.days && opts.days > 0
    ? new Date(Date.now() + opts.days * 86400000).toISOString()
    : null
  await sql`
    insert into lp_portal_tokens (lp_id, fund_id, token_hash, prefix, label, expires_at, created_by)
    values (${lpId}, ${fundId}, ${hashToken(token)}, ${prefix}, ${opts.label ?? null}, ${expiresAt}::timestamptz, ${opts.createdBy ?? null})
  `
  return { token, prefix, expiresAt }
}

/** Resolve a plaintext token to its LP, or null. Stamps last_seen + view. */
export async function verifyPortalToken(token: string): Promise<PortalLp | null> {
  if (!token || !token.startsWith("lp_")) return null
  const rows = await sql`
    select t.id as token_id, t.lp_id, t.fund_id, l.lp_name, f.name as fund_name
    from lp_portal_tokens t
    join fund_lps l on l.id = t.lp_id
    left join funds f on f.id = t.fund_id
    where t.token_hash = ${hashToken(token)}
      and t.revoked = false
      and (t.expires_at is null or t.expires_at > now())
    limit 1
  ` as Array<{ token_id: string; lp_id: string; fund_id: string; lp_name: string; fund_name: string | null }>
  const r = rows[0]
  if (!r) return null
  await sql`
    update lp_portal_tokens set last_seen_at = now(), view_count = view_count + 1 where id = ${r.token_id}
  `
  return { lpId: r.lp_id, fundId: r.fund_id, lpName: r.lp_name, fundName: r.fund_name, tokenId: r.token_id }
}

export interface PortalData {
  lp: { name: string; commitment: number | null; called: number | null; distributed: number | null; nav: number | null; ownershipPct: number | null }
  fundName: string | null
  positions: Array<{ asOf: string; commitment: number | null; called: number | null; distributed: number | null; nav: number | null }>
  letters: Array<{ id: string; title: string; quarter: string | null; sentAt: string | null }>
  documents: Array<{ id: string; title: string; type: string | null; url: string | null; at: string | null }>
}

/** Everything one LP may see. */
export async function getPortalData(lp: PortalLp): Promise<PortalData> {
  const [current, positions, letters, docs] = await Promise.all([
    sql`select lp_name, commitment_amount, called_amount, distributed_amount, ownership_pct
        from fund_lps where id = ${lp.lpId} limit 1` as Promise<Array<Record<string, any>>>,
    sql`select as_of, commitment, called, distributed, nav from lp_positions
        where lp_id = ${lp.lpId} order by as_of desc limit 48` as Promise<Array<Record<string, any>>>,
    sql`select id, title, quarter_label, sent_at from lp_quarterly_reports
        where fund_id = ${lp.fundId} and status in ('sent','published','approved')
        order by quarter_end desc nulls last limit 24` as Promise<Array<Record<string, any>>>,
    sql`select id, title, report_type, pdf_url, approved_at from lp_reports
        where fund_id = ${lp.fundId} and pdf_url is not null and status in ('sent','published','approved','final')
        order by created_at desc limit 24` as Promise<Array<Record<string, any>>>,
  ])
  const c = current[0] ?? {}
  const latest = positions[0] ?? {}
  const num = (v: unknown) => (v == null ? null : Number(v))
  return {
    fundName: lp.fundName,
    lp: {
      name: c.lp_name ?? lp.lpName,
      commitment: num(c.commitment_amount) ?? num(latest.commitment),
      called: num(c.called_amount) ?? num(latest.called),
      distributed: num(c.distributed_amount) ?? num(latest.distributed),
      nav: num(latest.nav),
      ownershipPct: num(c.ownership_pct),
    },
    positions: positions.map((p) => ({
      asOf: String(p.as_of).slice(0, 10),
      commitment: num(p.commitment), called: num(p.called), distributed: num(p.distributed), nav: num(p.nav),
    })),
    letters: letters.map((l) => ({ id: l.id, title: l.title, quarter: l.quarter_label ?? null, sentAt: l.sent_at ? String(l.sent_at).slice(0, 10) : null })),
    documents: docs.map((d) => ({ id: d.id, title: d.title, type: d.report_type ?? null, url: d.pdf_url ?? null, at: d.approved_at ? String(d.approved_at).slice(0, 10) : null })),
  }
}

/** Full markdown of a single letter, scoped to this LP's fund. */
export async function getPortalLetter(fundId: string, letterId: string): Promise<{ title: string; quarter: string | null; contentMd: string } | null> {
  const rows = await sql`
    select title, quarter_label, content_md from lp_quarterly_reports
    where id = ${letterId}::uuid and fund_id = ${fundId} and status in ('sent','published','approved') limit 1
  ` as Array<{ title: string; quarter_label: string | null; content_md: string | null }>
  const r = rows[0]
  if (!r) return null
  return { title: r.title, quarter: r.quarter_label, contentMd: r.content_md ?? "" }
}

export async function logPortalAccess(tokenId: string, lpId: string, path: string, ip: string | null) {
  try {
    await sql`insert into lp_portal_access_log (token_id, lp_id, path, ip) values (${tokenId}::uuid, ${lpId}, ${path}, ${ip})`
  } catch { /* logging is best-effort */ }
}
