/**
 * Claiming a record a fund added, and a profile for someone who already has an account (docs/architecture/67).
 * The address must be the account's confirmed one; a code sent to it proves it again unless doc 60's portal already did. Nothing about the record is copied into the profile.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import { sql } from "@/lib/db"
import { InvestorError, TERMS_VERSION, getEntity, getProfile } from "./profile"
import { maskEmail, CODE_MINUTES, CODE_MAX_TRIES, CODE_PER_HOUR, CODE_COOLDOWN_SEC } from "./signup"

const sha = (s: string) => createHash("sha256").update(s).digest("hex")
type Send = (m: { to: string; subject: string; text: string }) => Promise<void>
const defaultSend: Send = async (m) => {
  const { isResendConfigured, sendEmail } = await import("@/lib/email/resend")
  if (!isResendConfigured()) throw new InvestorError("Email sending is not configured, so nothing was sent.", 503, "email_off")
  await sendEmail({ ...m, noTracking: true })
}

export interface Claimable { lpId: string; fundName: string; name: string; onboardingState: string; proved: boolean }

/** Records whose contact address is this person's confirmed address and that nobody else holds. No amounts. */
export async function claimable(userId: string, email: string | null, confirmed: boolean): Promise<Claimable[]> {
  const e = String(email ?? "").trim().toLowerCase()
  if (!e || !confirmed) return []
  const rows = (await sql`SELECT l.id, l.lp_name, l.onboarding_state, f.name AS fund_name, a.user_id AS account_user
    FROM fund_lps l JOIN funds f ON f.id = l.fund_id LEFT JOIN contacts c ON c.id = l.lp_contact_id LEFT JOIN lp_accounts a ON a.lp_id = l.id
    WHERE l.status <> 'transferred'
      AND lower(COALESCE(NULLIF(trim(l.contact_email), ''), NULLIF(trim(c.email), ''), NULLIF(trim(l.metadata->>'email'), ''), NULLIF(trim(l.metadata->>'contact_email'), ''))) = ${e}
      AND NOT EXISTS (SELECT 1 FROM fund_relationships r WHERE r.fund_lp_id = l.id AND r.user_id <> ${userId})
      AND (a.user_id IS NULL OR a.user_id = ${userId})
      AND NOT EXISTS (SELECT 1 FROM fund_relationships r WHERE r.fund_lp_id = l.id AND r.user_id = ${userId})
    ORDER BY f.name`) as any[]
  return rows.map((r) => ({ lpId: String(r.id), fundName: r.fund_name ?? "A fund", name: r.lp_name, onboardingState: r.onboarding_state, proved: String(r.account_user ?? "") === userId }))
}

async function theClaim(userId: string, email: string | null, confirmed: boolean, lpId: string): Promise<Claimable> {
  const c = (await claimable(userId, email, confirmed)).find((x) => x.lpId === lpId)
  if (!c) throw new InvestorError("That record was not found for your address.", 404, "not_found")
  return c
}

export async function startClaim(userId: string, email: string | null, confirmed: boolean, lpId: string, send: Send = defaultSend): Promise<{ sentTo: string; expiresInMinutes: number } | { proved: true }> {
  const c = await theClaim(userId, email, confirmed, lpId)
  if (c.proved) return { proved: true }
  const to = String(email).trim().toLowerCase()
  const [r] = (await sql`SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour, max(created_at) AS last FROM investor_claim_codes WHERE user_id = ${userId}`) as any[]
  if (r?.last && Date.now() - new Date(r.last).getTime() < CODE_COOLDOWN_SEC * 1000) throw new InvestorError("A code was just sent. Check your email, or wait a minute for a new one.", 429, "wait")
  if (Number(r?.hour ?? 0) >= CODE_PER_HOUR) throw new InvestorError("Too many codes were requested. Please try again in an hour.", 429, "limit")
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await sql`DELETE FROM investor_claim_codes WHERE created_at < now() - interval '1 day'`.catch(() => {})
  await sql`INSERT INTO investor_claim_codes (user_id, lp_id, code_hash, expires_at) VALUES (${userId}, ${lpId}, ${sha(`${userId}:${lpId}:${code}`)}, now() + make_interval(mins => ${CODE_MINUTES}))`
  await send({ to, subject: `Your code: ${code}`, text: `Your Anker code is ${code}\n\nIt is valid for ${CODE_MINUTES} minutes. If you did not ask to link an investment, ignore this email.` })
  return { sentTo: maskEmail(to), expiresInMinutes: CODE_MINUTES }
}

const stageFor = (state: string) => (state === "countersigned" ? "active" : ["not_invited", "invited"].includes(state) ? "invited_to_onboard" : "onboarding")

export async function confirmClaim(userId: string, email: string | null, confirmed: boolean, input: { lpId: string; entityId: string; code?: unknown }): Promise<{ relationshipId: string; stage: string }> {
  const c = await theClaim(userId, email, confirmed, input.lpId)
  const entity = await getEntity(userId, String(input.entityId ?? ""))
  if (!entity) throw new InvestorError("Choose which of your entities this investment belongs to.", 404, "not_found")
  if (!c.proved) {
    const code = String(input.code ?? "").replace(/\s+/g, "")
    if (!/^\d{6}$/.test(code)) throw new InvestorError("Enter the six digits from the email.")
    const [row] = (await sql`SELECT id, code_hash, attempts FROM investor_claim_codes WHERE user_id = ${userId} AND lp_id = ${input.lpId} AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`) as any[]
    if (!row) throw new InvestorError("That code has expired. Ask for a new one.", 400, "expired")
    if (Number(row.attempts) >= CODE_MAX_TRIES) throw new InvestorError("Too many wrong tries. Ask for a new code.", 429, "locked")
    await sql`UPDATE investor_claim_codes SET attempts = attempts + 1 WHERE id = ${row.id}`
    const a = Buffer.from(sha(`${userId}:${input.lpId}:${code}`)), b = Buffer.from(String(row.code_hash))
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new InvestorError("That code is not right.", 400, "wrong")
    await sql`UPDATE investor_claim_codes SET used_at = now() WHERE id = ${row.id}`
  }
  const [lp] = (await sql`SELECT fund_id, onboarding_state FROM fund_lps WHERE id = ${input.lpId}`) as any[]
  const stage = stageFor(String(lp.onboarding_state))
  // The doc 60 account link, so the investment shows under /lp. Never over another person's.
  await sql`INSERT INTO lp_accounts (lp_id, fund_id, user_id, email) VALUES (${input.lpId}, ${lp.fund_id}, ${userId}, ${String(email).trim().toLowerCase()}) ON CONFLICT (lp_id) DO NOTHING`
  // An open request for the same entity and fund is linked; otherwise the fund's record becomes a relationship started by the fund.
  const linked = (await sql`UPDATE fund_relationships SET fund_lp_id = ${input.lpId}, stage = ${stage}, updated_at = now() WHERE fund_id = ${lp.fund_id} AND entity_id = ${entity.id} AND user_id = ${userId} AND fund_lp_id IS NULL AND stage IN ('interested', 'in_talks', 'invited_to_onboard', 'onboarding', 'on_hold') RETURNING id`) as any[]
  if (linked.length) return { relationshipId: String(linked[0].id), stage }
  try {
    const [rel] = (await sql`INSERT INTO fund_relationships (fund_id, entity_id, user_id, stage, initiated_by, fund_lp_id, shared) VALUES (${lp.fund_id}, ${entity.id}, ${userId}, ${stage}, 'fund', ${input.lpId}, ${JSON.stringify({ at: new Date().toISOString(), kind: entity.kind, name: entity.legalName })}::jsonb) RETURNING id`) as any[]
    return { relationshipId: String(rel.id), stage }
  } catch (e: any) {
    if (e?.code === "23505") throw new InvestorError("This entity already has an open relationship with that fund. Choose another entity, or withdraw it first.", 409, "open")
    throw e
  }
}

/** A profile and a first entity for someone who already has an account. One profile per account. */
export async function createProfileForAccount(userId: string, name: string, termsAccepted: unknown): Promise<void> {
  if (termsAccepted !== true) throw new InvestorError("Accept the privacy notice and terms to continue.", 400, "terms")
  if (await getProfile(userId)) throw new InvestorError("You already have an investor profile.", 409, "exists")
  const n = String(name ?? "").replace(/\s+/g, " ").trim().slice(0, 120)
  if (n.length < 2) throw new InvestorError("Enter your name (at least two characters).")
  const rows = (await sql`INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) VALUES (${userId}, ${n}, ${TERMS_VERSION}, now()) ON CONFLICT (user_id) DO NOTHING RETURNING user_id`) as any[]
  if (!rows.length) throw new InvestorError("You already have an investor profile.", 409, "exists")
  await sql`INSERT INTO investor_entities (user_id, legal_name, kind) VALUES (${userId}, ${n}, 'individual')`
}
