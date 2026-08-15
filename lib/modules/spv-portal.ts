import { sql } from "@/lib/db"
import { randomBytes, createHash } from "node:crypto"

/**
 * SPV LP portal — magic-link tokens + per-subscriber scoped data. Mirrors
 * lib/portfolio/lp-portal. mintSpvPortalToken returns the plaintext ONCE (only
 * the hash is stored). verifySpvPortalToken resolves a token to its subscription
 * (checking expiry + revocation, stamping last_seen). getSpvPortalData assembles
 * exactly what one subscriber may see: their own position + the SPV summary.
 * Nothing crosses subscriber boundaries.
 */

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex")
const num = (v: any) => (v == null ? 0 : Number(v))

export interface SpvPortalRef {
  tokenId: string
  subscriptionId: string
  spvId: string
}

export async function mintSpvPortalToken(
  subId: string, spvId: string, opts: { days?: number; label?: string; createdBy?: string } = {},
): Promise<{ token: string; prefix: string; expiresAt: string | null }> {
  const token = "spv_" + randomBytes(24).toString("base64url")
  const prefix = token.slice(0, 12)
  const expiresAt = opts.days && opts.days > 0 ? new Date(Date.now() + opts.days * 86400000).toISOString() : null
  await sql`
    INSERT INTO spv_portal_tokens (subscription_id, spv_id, token_hash, prefix, label, expires_at, created_by)
    VALUES (${subId}, ${spvId}, ${hashToken(token)}, ${prefix}, ${opts.label ?? null}, ${expiresAt}::timestamptz, ${opts.createdBy ?? null})`
  return { token, prefix, expiresAt }
}

export async function verifySpvPortalToken(token: string): Promise<SpvPortalRef | null> {
  if (!token || !token.startsWith("spv_")) return null
  const rows = await sql`
    SELECT id AS token_id, subscription_id, spv_id
    FROM spv_portal_tokens
    WHERE token_hash = ${hashToken(token)} AND revoked = false
      AND (expires_at IS NULL OR expires_at > now())
    LIMIT 1` as Array<{ token_id: string; subscription_id: string; spv_id: string }>
  const r = rows[0]
  if (!r) return null
  await sql`UPDATE spv_portal_tokens SET last_seen_at = now(), view_count = view_count + 1 WHERE id = ${r.token_id}`
  return { tokenId: r.token_id, subscriptionId: r.subscription_id, spvId: r.spv_id }
}

export interface SpvPortalData {
  spv: { name: string; dealName: string | null; stage: string; target: number; committed: number; closeDate: string | null }
  investor: { name: string; email: string | null; amount: number; status: string; ownershipPct: number | null; subscribedAt: string | null }
}

/** Everything one subscriber may see: their position + the SPV summary. */
export async function getSpvPortalData(ref: SpvPortalRef): Promise<SpvPortalData | null> {
  const subRows = await sql`
    SELECT investor_name, investor_email, amount, status, subscribed_at
    FROM spv_subscriptions WHERE id = ${ref.subscriptionId} LIMIT 1` as Array<Record<string, any>>
  const spvRows = await sql`
    SELECT name, deal_name, stage, target_amount, committed_amount, close_date
    FROM spvs WHERE id = ${ref.spvId} LIMIT 1` as Array<Record<string, any>>
  const sub = subRows[0]
  const spv = spvRows[0]
  if (!sub || !spv) return null

  // Ownership only counts once capital is in (committed / signed / funded).
  const totalRows = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM spv_subscriptions WHERE spv_id = ${ref.spvId} AND status IN ('committed', 'signed', 'funded')` as Array<{ total: any }>
  const total = num(totalRows[0]?.total)
  const contributes = ["committed", "signed", "funded"].includes(sub.status)
  const ownershipPct = contributes && total > 0 ? num(sub.amount) / total : null

  return {
    spv: {
      name: spv.name, dealName: spv.deal_name ?? null, stage: spv.stage,
      target: num(spv.target_amount), committed: num(spv.committed_amount),
      closeDate: spv.close_date ? String(spv.close_date) : null,
    },
    investor: {
      name: sub.investor_name, email: sub.investor_email ?? null,
      amount: num(sub.amount), status: sub.status, ownershipPct,
      subscribedAt: sub.subscribed_at ? String(sub.subscribed_at) : null,
    },
  }
}

// ── Admin: list + revoke ─────────────────────────────────────────────────────
export async function listSpvPortalTokens(subId: string) {
  return sql`
    SELECT id, prefix, label, expires_at, revoked, last_seen_at, view_count, created_at
    FROM spv_portal_tokens WHERE subscription_id = ${subId} ORDER BY created_at DESC`
}

/** Guard the mint/list/revoke by confirming the SPV belongs to the user. */
export async function userOwnsSpv(userId: string, spvId: string): Promise<boolean> {
  const rows = await sql`SELECT 1 FROM spvs WHERE id = ${spvId} AND created_by = ${userId} LIMIT 1`
  return !!rows[0]
}

export async function revokeSpvPortalToken(tokenId: string, spvId: string): Promise<void> {
  await sql`UPDATE spv_portal_tokens SET revoked = true WHERE id = ${tokenId} AND spv_id = ${spvId}`
}
