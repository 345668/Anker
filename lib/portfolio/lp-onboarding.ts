import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import { sql } from "@/lib/db"
import { encryptSecret, decryptSecret } from "@/lib/db/secrets"
import { mintPortalToken } from "./lp-portal"

/**
 * The LP leg, slice L1 (docs/architecture/60): contact address, invite, the emailed code that opens the portal, the onboarding steps.
 * Nothing here lets an LP change an amount; what an LP says about themselves is stored beside the fund's record and reviewed by the fund.
 */
export const TERMS_VERSION = "2026-10"
export const LINK_DAYS = 30
export const CODE_MINUTES = 10, CODE_MAX_TRIES = 3, CODE_PER_HOUR = 5, CODE_COOLDOWN_SEC = 60, SESSION_HOURS = 12

export const STATES = ["not_invited", "invited", "opened", "details_confirmed", "terms_accepted", "verification_submitted", "subscription_returned", "countersigned"] as const
export type OnboardingState = (typeof STATES)[number]
export const stateIndex = (s: string) => STATES.indexOf(s as OnboardingState)

export class LpError extends Error { constructor(message: string, readonly status = 400, readonly code = "invalid") { super(message); this.name = "LpError" } }

const sha = (s: string) => createHash("sha256").update(s).digest("hex")
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2")

/** Moves an LP forward to a step, never back. Returns whether it moved. */
export async function advance(lpId: string, to: OnboardingState): Promise<boolean> {
  const col = ({ invited: "invited_at", opened: "opened_at", details_confirmed: "details_confirmed_at", terms_accepted: "terms_accepted_at" } as Record<string, string | undefined>)[to]
  const idx = stateIndex(to)
  const rows = (await sql`UPDATE fund_lps SET onboarding_state = ${to},
      invited_at = CASE WHEN ${col === "invited_at"} THEN now() ELSE invited_at END,
      opened_at = CASE WHEN ${col === "opened_at"} THEN now() ELSE opened_at END,
      details_confirmed_at = CASE WHEN ${col === "details_confirmed_at"} THEN now() ELSE details_confirmed_at END,
      terms_accepted_at = CASE WHEN ${col === "terms_accepted_at"} THEN now() ELSE terms_accepted_at END,
      updated_at = now()
    WHERE id = ${lpId} AND array_position(ARRAY['not_invited','invited','opened','details_confirmed','terms_accepted','verification_submitted','subscription_returned','countersigned'], onboarding_state) < ${idx + 1} RETURNING id`) as any[]
  return rows.length > 0
}

/** The address an LP is written to: the one typed on the LP row, else the linked contact's, else an address kept in the row's metadata. */
export async function lpEmail(lpId: string): Promise<{ email: string | null; name: string | null; lpName: string; fundId: string; fundName: string | null } | null> {
  const [r] = (await sql`SELECT l.fund_id, l.lp_name, f.name AS fund_name,
      COALESCE(NULLIF(trim(l.contact_email), ''), NULLIF(trim(c.email), ''), NULLIF(trim(l.metadata->>'email'), ''), NULLIF(trim(l.metadata->>'contact_email'), '')) AS email,
      COALESCE(NULLIF(trim(l.contact_name), ''), NULLIF(trim(concat_ws(' ', c.first_name, c.last_name)), '')) AS name
    FROM fund_lps l LEFT JOIN contacts c ON c.id = l.lp_contact_id LEFT JOIN funds f ON f.id = l.fund_id WHERE l.id = ${lpId} LIMIT 1`) as any[]
  return r ? { email: r.email ? String(r.email).trim().toLowerCase() : null, name: r.name ?? null, lpName: r.lp_name, fundId: String(r.fund_id), fundName: r.fund_name ?? null } : null
}

export async function setContact(lpId: string, input: { email: unknown; name?: unknown }): Promise<void> {
  const email = String(input.email ?? "").trim().toLowerCase()
  if (!EMAIL_RE.test(email)) throw new LpError("Enter a valid email address.")
  const name = input.name ? String(input.name).trim().slice(0, 120) : null
  const rows = (await sql`UPDATE fund_lps SET contact_email = ${email}, contact_name = ${name}, updated_at = now() WHERE id = ${lpId} RETURNING id`) as any[]
  if (!rows.length) throw new LpError("LP not found.", 404)
}

type Send = (m: { to: string; subject: string; text: string }) => Promise<void>
const defaultSend: Send = async (m) => {
  const { isResendConfigured, sendEmail } = await import("@/lib/email/resend")
  if (!isResendConfigured()) throw new LpError("Email sending is not configured, so nothing was sent.", 503, "email_off")
  await sendEmail({ ...m, noTracking: true })
}

/**
 * Invites an LP: a personal link valid 30 days, sent to their address. Earlier links of the same LP are revoked, so a resend never leaves several live.
 * The link is minted only after the address is known and sending is possible, and revoked again if the email fails.
 */
export async function inviteLp(lpId: string, by: string, appUrl: string, send: Send = defaultSend): Promise<{ sentTo: string; expiresAt: string | null }> {
  const lp = await lpEmail(lpId)
  if (!lp) throw new LpError("LP not found.", 404)
  if (!lp.email) throw new LpError("Add this LP's email address first.", 422, "no_email")
  const minted = await mintPortalToken(lpId, lp.fundId, { days: LINK_DAYS, label: `invited ${new Date().toISOString().slice(0, 10)}`, createdBy: by })
  const hash = sha(minted.token)
  const link = `${appUrl.replace(/\/$/, "")}/portal/${minted.token}`
  try {
    await send({
      to: lp.email,
      subject: `Your investor portal: ${lp.fundName ?? "your fund"}`,
      text: [lp.name ? `Hello ${lp.name.split(" ")[0]},` : "Hello,", "", `${lp.fundName ?? "Your fund"} has set up a private investor portal for you. Open it here:`, link, "",
        `The link is valid for ${LINK_DAYS} days and is personal to you. When you open it you will be sent a six-digit code at this address, so please do not forward the email.`, "", `${lp.fundName ?? "The fund team"}`].join("\n"),
    })
  } catch (e) {
    await sql`UPDATE lp_portal_tokens SET revoked = true WHERE token_hash = ${hash}`.catch(() => {})
    throw e
  }
  await sql`UPDATE lp_portal_tokens SET revoked = true WHERE lp_id = ${lpId} AND token_hash <> ${hash} AND revoked = false`
  await advance(lpId, "invited")
  return { sentTo: maskEmail(lp.email), expiresAt: minted.expiresAt }
}

// ───────────── the code that opens the portal ─────────────
/** Sends a fresh six-digit code to the LP's address. At most one a minute and five an hour per link. */
export async function sendCode(tokenId: string, lpId: string, send: Send = defaultSend): Promise<{ sentTo: string; expiresInMinutes: number }> {
  const lp = await lpEmail(lpId)
  if (!lp?.email) throw new LpError("This portal has no email address to send a code to. Please contact the fund.", 422, "no_email")
  const [r] = (await sql`SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour, max(created_at) AS last FROM lp_portal_codes WHERE token_id = ${tokenId}::uuid`) as any[]
  if (r?.last && Date.now() - new Date(r.last).getTime() < CODE_COOLDOWN_SEC * 1000) throw new LpError("A code was just sent. Check your email, or wait a minute for a new one.", 429, "wait")
  if (Number(r?.hour ?? 0) >= CODE_PER_HOUR) throw new LpError("Too many codes were requested. Please try again in an hour.", 429, "limit")
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await sql`INSERT INTO lp_portal_codes (token_id, lp_id, code_hash, expires_at) VALUES (${tokenId}::uuid, ${lpId}, ${sha(`${tokenId}:${code}`)}, now() + make_interval(mins => ${CODE_MINUTES}))`
  await send({ to: lp.email, subject: `Your code: ${code}`, text: `Your investor portal code is ${code}\n\nIt is valid for ${CODE_MINUTES} minutes. If you did not just open your portal link, ignore this email: nobody can see anything without this code.\n\n${lp.fundName ?? ""}`.trim() })
  return { sentTo: maskEmail(lp.email), expiresInMinutes: CODE_MINUTES }
}

/** Checks a code. Three tries per code; a wrong code never says how close it was. Returns the session value to set as a cookie. */
export async function verifyCode(tokenId: string, lpId: string, code: unknown, ip: string | null): Promise<{ session: string; expiresAt: Date }> {
  const c = String(code ?? "").replace(/\s+/g, "")
  if (!/^\d{6}$/.test(c)) throw new LpError("Enter the six digits from the email.")
  const [row] = (await sql`SELECT id, code_hash, attempts FROM lp_portal_codes WHERE token_id = ${tokenId}::uuid AND used_at IS NULL AND expires_at > now() ORDER BY id DESC LIMIT 1`) as any[]
  if (!row) throw new LpError("That code has expired. Ask for a new one.", 400, "expired")
  if (Number(row.attempts) >= CODE_MAX_TRIES) throw new LpError("Too many wrong tries. Ask for a new code.", 429, "locked")
  await sql`UPDATE lp_portal_codes SET attempts = attempts + 1 WHERE id = ${row.id}`
  const a = Buffer.from(sha(`${tokenId}:${c}`)), b = Buffer.from(String(row.code_hash))
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new LpError("That code is not right.", 400, "wrong")
  await sql`UPDATE lp_portal_codes SET used_at = now() WHERE id = ${row.id}`
  const session = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600_000)
  await sql`INSERT INTO lp_portal_sessions (token_id, lp_id, session_hash, ip, expires_at) VALUES (${tokenId}::uuid, ${lpId}, ${sha(session)}, ${ip}, ${expiresAt.toISOString()}::timestamptz)`
  await advance(lpId, "opened")
  return { session, expiresAt }
}

/** True when this browser's cookie belongs to a live session of this very link. */
export async function sessionOk(tokenId: string, cookie: string | null | undefined): Promise<boolean> {
  if (!cookie || cookie.length < 20) return false
  const [r] = (await sql`UPDATE lp_portal_sessions SET last_seen_at = now() WHERE session_hash = ${sha(cookie)} AND token_id = ${tokenId}::uuid AND revoked = false AND expires_at > now() RETURNING id`) as any[]
  return !!r
}
export const sessionCookieName = (tokenId: string) => `lp_s_${tokenId.replace(/-/g, "").slice(0, 12)}`

// ───────────── what the LP confirms ─────────────
export const ENTITY_TYPES = ["individual", "company", "trust", "fund", "family_office", "other"] as const
export interface LpDetailsInput { legalName: unknown; entityType: unknown; address?: unknown; country?: unknown; taxResidence?: unknown; taxId?: unknown; signatoryName?: unknown }
const clean = (v: unknown, max: number) => { const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max); return s || null }

export async function confirmDetails(lpId: string, input: LpDetailsInput): Promise<void> {
  const legalName = clean(input.legalName, 200)
  if (!legalName) throw new LpError("Enter your legal name.")
  const entityType = String(input.entityType ?? "")
  if (!(ENTITY_TYPES as readonly string[]).includes(entityType)) throw new LpError("Choose the kind of investor you are.")
  const taxId = clean(input.taxId, 60)
  await sql`INSERT INTO lp_onboarding_details (lp_id, legal_name, entity_type, address, country, tax_residence, tax_id_enc, signatory_name, confirmed_at, reviewed_at, reviewed_by)
    VALUES (${lpId}, ${legalName}, ${entityType}, ${clean(input.address, 300)}, ${clean(input.country, 60)}, ${clean(input.taxResidence, 60)}, ${taxId ? encryptSecret(taxId) : null}, ${clean(input.signatoryName, 120)}, now(), NULL, NULL)
    ON CONFLICT (lp_id) DO UPDATE SET legal_name = EXCLUDED.legal_name, entity_type = EXCLUDED.entity_type, address = EXCLUDED.address, country = EXCLUDED.country, tax_residence = EXCLUDED.tax_residence,
      tax_id_enc = EXCLUDED.tax_id_enc, signatory_name = EXCLUDED.signatory_name, confirmed_at = now(), reviewed_at = NULL, reviewed_by = NULL`
  await advance(lpId, "details_confirmed")
}

export async function acceptTerms(lpId: string, ip: string | null, userAgent: string | null): Promise<void> {
  const [lp] = (await sql`SELECT onboarding_state FROM fund_lps WHERE id = ${lpId}`) as any[]
  if (!lp || stateIndex(lp.onboarding_state) < stateIndex("details_confirmed")) throw new LpError("Please confirm your details first.", 409, "order")
  await sql`INSERT INTO lp_terms_acceptances (lp_id, version, ip, user_agent_hash) VALUES (${lpId}, ${TERMS_VERSION}, ${ip}, ${userAgent ? sha(userAgent).slice(0, 16) : null})`
  await advance(lpId, "terms_accepted")
}

export interface OnboardingView { state: OnboardingState; steps: Array<{ key: string; label: string; done: boolean; at: string | null }>; details: { legalName: string; entityType: string; address: string | null; country: string | null; taxResidence: string | null; taxIdLast4: string | null; signatoryName: string | null } | null; termsVersion: string }
export async function onboardingView(lpId: string): Promise<OnboardingView | null> {
  const [l] = (await sql`SELECT onboarding_state, invited_at, opened_at, details_confirmed_at, terms_accepted_at FROM fund_lps WHERE id = ${lpId}`) as any[]
  if (!l) return null
  const [d] = (await sql`SELECT legal_name, entity_type, address, country, tax_residence, tax_id_enc, signatory_name FROM lp_onboarding_details WHERE lp_id = ${lpId}`) as any[]
  const i = stateIndex(l.onboarding_state), at = (v: unknown) => (v ? new Date(v as string).toISOString().slice(0, 10) : null)
  const tax = d?.tax_id_enc ? decryptSecret(d.tax_id_enc) : null
  return {
    state: l.onboarding_state,
    steps: [
      { key: "opened", label: "Open your portal", done: i >= stateIndex("opened"), at: at(l.opened_at) },
      { key: "details", label: "Confirm your details", done: i >= stateIndex("details_confirmed"), at: at(l.details_confirmed_at) },
      { key: "terms", label: "Accept the terms and privacy notice", done: i >= stateIndex("terms_accepted"), at: at(l.terms_accepted_at) },
      { key: "verification", label: "Identity verification (coming next)", done: i >= stateIndex("verification_submitted"), at: null },
      { key: "subscription", label: "Subscription documents (coming next)", done: i >= stateIndex("subscription_returned"), at: null },
    ],
    details: d ? { legalName: d.legal_name, entityType: d.entity_type, address: d.address, country: d.country, taxResidence: d.tax_residence, taxIdLast4: tax ? String(tax).slice(-4) : null, signatoryName: d.signatory_name } : null,
    termsVersion: TERMS_VERSION,
  }
}

// ───────────── the fund's view ─────────────
export interface LpOnboardingRow { id: string; name: string; type: string | null; state: OnboardingState; email: string | null; contactName: string | null; invitedAt: string | null; openedAt: string | null; waitingDays: number | null; differs: boolean; detailsToReview: boolean; submitted: { legalName: string; entityType: string; country: string | null; taxResidence: string | null; taxIdLast4: string | null } | null }
export async function listForFund(fundId: string): Promise<LpOnboardingRow[]> {
  const rows = (await sql`SELECT l.id, l.lp_name, l.lp_type, l.onboarding_state, l.invited_at, l.opened_at, l.details_confirmed_at, l.terms_accepted_at, l.updated_at,
      COALESCE(NULLIF(trim(l.contact_email), ''), NULLIF(trim(c.email), ''), NULLIF(trim(l.metadata->>'email'), ''), NULLIF(trim(l.metadata->>'contact_email'), '')) AS email,
      COALESCE(NULLIF(trim(l.contact_name), ''), NULLIF(trim(concat_ws(' ', c.first_name, c.last_name)), '')) AS contact_name,
      d.legal_name, d.entity_type, d.country, d.tax_residence, d.tax_id_enc, d.reviewed_at
    FROM fund_lps l LEFT JOIN contacts c ON c.id = l.lp_contact_id LEFT JOIN lp_onboarding_details d ON d.lp_id = l.id
    WHERE l.fund_id = ${fundId} AND l.status <> 'transferred' ORDER BY l.lp_name`) as any[]
  const day = 86_400_000
  return rows.map((r) => {
    const last = [r.terms_accepted_at, r.details_confirmed_at, r.opened_at, r.invited_at].find(Boolean)
    const waiting = r.onboarding_state !== "not_invited" && r.onboarding_state !== "countersigned" && last ? Math.floor((Date.now() - new Date(last).getTime()) / day) : null
    const tax = r.tax_id_enc ? decryptSecret(r.tax_id_enc) : null
    return { id: r.id, name: r.lp_name, type: r.lp_type ?? null, state: r.onboarding_state, email: r.email ? String(r.email).toLowerCase() : null, contactName: r.contact_name ?? null,
      invitedAt: r.invited_at ? new Date(r.invited_at).toISOString().slice(0, 10) : null, openedAt: r.opened_at ? new Date(r.opened_at).toISOString().slice(0, 10) : null, waitingDays: waiting,
      differs: !!r.legal_name && r.legal_name.trim().toLowerCase() !== String(r.lp_name).trim().toLowerCase(), detailsToReview: !!r.legal_name && !r.reviewed_at,
      submitted: r.legal_name ? { legalName: r.legal_name, entityType: r.entity_type, country: r.country ?? null, taxResidence: r.tax_residence ?? null, taxIdLast4: tax ? String(tax).slice(-4) : null } : null }
  })
}

/** The fund marks the LP's submitted details as read. It does not copy them over the fund's own record. */
export async function markReviewed(lpId: string, by: string): Promise<void> {
  await sql`UPDATE lp_onboarding_details SET reviewed_at = now(), reviewed_by = ${by} WHERE lp_id = ${lpId}`
}
