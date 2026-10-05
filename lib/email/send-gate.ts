/**
 * The send gate every outreach email passes: the global opt-out, then the country rule.
 *
 * docs/architecture/37 section 8.3: German unfair-competition law (UWG 7(2) no. 2) treats email advertising as
 * unreasonable harassment without the recipient's prior express consent, with no business-to-business exemption.
 * Until counsel decides otherwise the other EU/EEA states are gated the same way. A sender can attest, per
 * recipient, to prior express consent or an existing-customer relationship (`outreach_consents`); that attestation is
 * the customer's own statement and is stored with who made it and when. Recipients elsewhere are permitted with the
 * footer and opt-out. An unknown country is permitted unless the address's country-code domain is gated.
 *
 * Country comes from, in order: the caller's hint, the directory record for that address, the domain's ccTLD.
 * `OUTREACH_COUNTRY_GATE=off` disables the country rule (never the opt-out); it exists for counsel-approved changes.
 */
import { sql } from "@/lib/db"
import { isGloballySuppressed, normEmail, SuppressedRecipientError } from "@/lib/email/unsubscribe"

/** EU member states plus Iceland, Liechtenstein and Norway. */
export const GATED_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT",
  "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO",
])

const NAMES: Record<string, string> = {
  germany: "DE", deutschland: "DE", austria: "AT", osterreich: "AT", belgium: "BE", bulgaria: "BG", croatia: "HR", cyprus: "CY",
  "czech republic": "CZ", czechia: "CZ", denmark: "DK", estonia: "EE", finland: "FI", france: "FR", greece: "GR", hungary: "HU",
  ireland: "IE", italy: "IT", latvia: "LV", lithuania: "LT", luxembourg: "LU", malta: "MT", netherlands: "NL", "the netherlands": "NL",
  poland: "PL", portugal: "PT", romania: "RO", slovakia: "SK", slovenia: "SI", spain: "ES", sweden: "SE", iceland: "IS",
  liechtenstein: "LI", norway: "NO", "united kingdom": "GB", uk: "GB", "united states": "US", usa: "US", switzerland: "CH",
}

/** A country name or ISO code to an ISO code, or null. */
export function countryCode(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  if (!s) return null
  if (/^[a-z]{2}$/.test(s)) return s.toUpperCase()
  return NAMES[s] ?? null
}

const TLD_COUNTRY: Record<string, string> = { uk: "GB" }
export function countryFromEmailDomain(email: string): string | null {
  const tld = normEmail(email).split("@")[1]?.split(".").pop() ?? ""
  if (tld.length !== 2) return null
  return TLD_COUNTRY[tld] ?? tld.toUpperCase()
}

async function directoryCountry(email: string): Promise<string | null> {
  try {
    const rows = (await sql`SELECT norm_country, investor_country FROM investors WHERE lower(email) = ${normEmail(email)} LIMIT 1`) as any[]
    return countryCode(rows[0]?.norm_country) ?? countryCode(rows[0]?.investor_country)
  } catch {
    return null
  }
}

export async function resolveRecipientCountry(email: string, hint?: string | null): Promise<string | null> {
  return countryCode(hint) ?? (await directoryCountry(email)) ?? countryFromEmailDomain(email)
}

export async function hasConsent(userId: string | null | undefined, email: string): Promise<boolean> {
  if (!userId) return false
  try {
    const rows = (await sql`SELECT 1 FROM outreach_consents WHERE user_id = ${userId} AND lower(email) = ${normEmail(email)} AND revoked_at IS NULL LIMIT 1`) as any[]
    return rows.length > 0
  } catch {
    return false
  }
}

export async function recordConsent(userId: string, email: string, basis: "prior_express_consent" | "existing_customer", note?: string | null): Promise<void> {
  const e = normEmail(email)
  if (!e.includes("@")) throw new Error("A valid email address is required")
  await sql`INSERT INTO outreach_consents (user_id, email, basis, note) VALUES (${userId}, ${e}, ${basis}, ${note ?? null})
    ON CONFLICT (user_id, lower(email)) DO UPDATE SET basis = EXCLUDED.basis, note = EXCLUDED.note, attested_at = now(), revoked_at = NULL`
}

/** The sender id for mail Anker itself sends for a founder's pitch-us submission (no Anker user sends it). The owner attests for it. */
export const PLATFORM_SENDER_ID = "platform:pitch-us"

export class CountryGateError extends Error {
  readonly code = "country_gated"
  constructor(readonly email: string, readonly country: string) {
    super(`Not sent: ${country} recipients need prior express consent. Record that consent or an existing-customer relationship for this address, or leave it out of the campaign.`)
    this.name = "CountryGateError"
  }
}

export interface GateInput { to: string; senderUserId?: string | null; recipientCountry?: string | null }

/** Throws SuppressedRecipientError or CountryGateError; returns normally when the email may be sent. */
export async function assertOutreachAllowed(i: GateInput): Promise<void> {
  if (await isGloballySuppressed(i.to)) throw new SuppressedRecipientError(i.to)
  // The sender's workspace: paused, outreach not in the plan, or today's allowance used up (docs/architecture/41).
  await (await import("@/lib/entitlements")).assertSenderMayContact(i.senderUserId)
  if ((process.env.OUTREACH_COUNTRY_GATE ?? "on").toLowerCase() === "off") return
  const country = await resolveRecipientCountry(i.to, i.recipientCountry)
  if (country && GATED_COUNTRIES.has(country) && !(await hasConsent(i.senderUserId, i.to))) throw new CountryGateError(i.to, country)
}

export interface DroppedRecipient { email: string; field: "cc" | "bcc"; reason: "suppressed" | "country_gated" }

/**
 * The cc and bcc addresses of an outreach email are recipients too, and they used to reach the provider unchecked: only `to` passed the gate, so an address on the
 * do-not-send list, or a country-gated address without recorded consent, could receive a campaign's mail by being on its cc list (docs/architecture/46 §1.3, gap 4).
 *
 * The opt-out is absolute for both fields. The country rule applies to cc, which is a visible recipient of the message; a bcc is typically the sender's own or a
 * platform copy, so it gets the opt-out but not the consent rule (a founder's own copy of their campaign should not vanish because they are in Germany).
 * A refused address is dropped from the send and reported to the caller; it does not stop mail to the person who is actually being written to.
 */
export async function filterSecondaryRecipients(i: { cc?: string[]; bcc?: string[]; senderUserId?: string | null }): Promise<{ cc: string[]; bcc: string[]; dropped: DroppedRecipient[] }> {
  const dropped: DroppedRecipient[] = []
  const countryRule = (process.env.OUTREACH_COUNTRY_GATE ?? "on").toLowerCase() !== "off"
  const keep = async (list: string[] | undefined, field: "cc" | "bcc") => {
    const out: string[] = []
    for (const email of list ?? []) {
      if (await isGloballySuppressed(email)) { dropped.push({ email, field, reason: "suppressed" }); continue }
      if (field === "cc" && countryRule) {
        const country = await resolveRecipientCountry(email)
        if (country && GATED_COUNTRIES.has(country) && !(await hasConsent(i.senderUserId, email))) { dropped.push({ email, field, reason: "country_gated" }); continue }
      }
      out.push(email)
    }
    return out
  }
  return { cc: await keep(i.cc, "cc"), bcc: await keep(i.bcc, "bcc"), dropped }
}
