/**
 * One-click investor interest links. Reuses the LP-portal token discipline:
 * a long random plaintext token is generated, embedded in the investor's email,
 * and only its SHA-256 hash is stored (campaign_interest_tokens). The same token
 * serves three actions on /api/public/interest/[token]:
 *   ?a=yes   → interested      ?a=no → not interested      ?a=view → open deck
 */
import { createHash, randomBytes } from "node:crypto"
import { sql } from "@/lib/db"

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex")
}

/** Mint a token for a campaign_crm_entry; returns the plaintext (store nothing else). */
export async function mintInterestToken(
  campaignCrmEntryId: string,
  expiresInDays = 60,
): Promise<string> {
  const plaintext = randomBytes(24).toString("base64url")
  const tokenHash = hashToken(plaintext)
  const expiresAt = new Date(Date.now() + expiresInDays * 86400_000).toISOString()
  await sql`
    INSERT INTO campaign_interest_tokens (token_hash, campaign_crm_entry_id, expires_at)
    VALUES (${tokenHash}, ${campaignCrmEntryId}, ${expiresAt})
    ON CONFLICT (token_hash) DO NOTHING
  `
  return plaintext
}

export interface ResolvedInterestToken {
  tokenHash: string
  entryId: string
  campaignId: string
  submissionId: string
  choiceLocked: boolean
  expired: boolean
}

/** Resolve a plaintext token to its entry, or null if unknown. */
export async function resolveInterestToken(plaintext: string): Promise<ResolvedInterestToken | null> {
  const tokenHash = hashToken(plaintext)
  const rows = await sql`
    SELECT t.token_hash, t.choice_locked, t.expires_at,
           e.id AS entry_id, e.outreach_campaign_id, e.submission_id
    FROM campaign_interest_tokens t
    JOIN campaign_crm_entries e ON e.id = t.campaign_crm_entry_id
    WHERE t.token_hash = ${tokenHash}
    LIMIT 1
  `
  if (!rows.length) return null
  const r = rows[0] as any
  return {
    tokenHash: r.token_hash,
    entryId: r.entry_id,
    campaignId: r.outreach_campaign_id,
    submissionId: r.submission_id,
    choiceLocked: !!r.choice_locked,
    expired: !!r.expires_at && new Date(r.expires_at).getTime() < Date.now(),
  }
}
