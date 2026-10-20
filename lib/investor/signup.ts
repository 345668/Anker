/**
 * Investor sign-up (docs/architecture/64 section 6): the address is proved before any account exists.
 *   start  -> a six-digit code is emailed (the email holds only the code)
 *   verify -> the code and a password; only now is the account made, already confirmed, with the profile and a first entity
 * Closed while the platform flag `investor_signup` is off.
 */
import { createHash, randomInt, timingSafeEqual } from "node:crypto"
import { sql } from "@/lib/db"
import { InvestorError, TERMS_VERSION } from "./profile"

export const CODE_MINUTES = 10, CODE_MAX_TRIES = 3, CODE_PER_HOUR = 5, CODE_COOLDOWN_SEC = 60, IP_PER_HOUR = 20, MIN_PASSWORD = 10
export const FLAG = "investor_signup"
const sha = (s: string) => createHash("sha256").update(s).digest("hex")
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/
export const maskEmail = (e: string) => e.replace(/^(.).*(@.*)$/, "$1***$2")

export type Send = (m: { to: string; subject: string; text: string }) => Promise<void>
const defaultSend: Send = async (m) => {
  const { isResendConfigured, sendEmail } = await import("@/lib/email/resend")
  if (!isResendConfigured()) throw new InvestorError("Email sending is not configured, so nothing was sent.", 503, "email_off")
  await sendEmail({ ...m, noTracking: true })
}
export interface AdminAuth { createUser(a: { email: string; password: string; email_confirm: boolean; user_metadata: Record<string, unknown> }): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> }

export async function signupOpen(): Promise<boolean> {
  try { const [r] = (await sql`SELECT enabled FROM platform_flags WHERE key = ${FLAG}`) as any[]; return !!r?.enabled } catch { return false }
}
const CLOSED = () => new InvestorError("Investor sign-up is not open yet.", 403, "closed")

export async function startSignup(input: { email: unknown; name: unknown; termsAccepted: unknown; ip: string | null }, send: Send = defaultSend): Promise<{ sentTo: string; expiresInMinutes: number }> {
  if (!(await signupOpen())) throw CLOSED()
  const email = String(input.email ?? "").trim().toLowerCase(), name = String(input.name ?? "").replace(/\s+/g, " ").trim().slice(0, 120)
  if (!EMAIL.test(email)) throw new InvestorError("Enter a valid email address.")
  if (name.length < 2) throw new InvestorError("Enter your name (at least two characters).")
  if (input.termsAccepted !== true) throw new InvestorError("Accept the privacy notice and terms to continue.", 400, "terms")
  const [r] = (await sql`SELECT count(*) FILTER (WHERE created_at > now() - interval '1 hour')::int AS hour, max(created_at) AS last FROM investor_signup_codes WHERE lower(email) = ${email}`) as any[]
  if (r?.last && Date.now() - new Date(r.last).getTime() < CODE_COOLDOWN_SEC * 1000) throw new InvestorError("A code was just sent. Check your email, or wait a minute for a new one.", 429, "wait")
  if (Number(r?.hour ?? 0) >= CODE_PER_HOUR) throw new InvestorError("Too many codes were requested for this address. Please try again in an hour.", 429, "limit")
  if (input.ip) {
    const [i] = (await sql`SELECT count(*)::int AS n FROM investor_signup_codes WHERE ip = ${input.ip} AND created_at > now() - interval '1 hour'`) as any[]
    if (Number(i?.n ?? 0) >= IP_PER_HOUR) throw new InvestorError("Too many sign-up attempts from this network. Please try again later.", 429, "limit")
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0")
  await sql`DELETE FROM investor_signup_codes WHERE created_at < now() - interval '1 day'`.catch(() => {})
  await sql`INSERT INTO investor_signup_codes (email, name, code_hash, ip, terms_version, expires_at) VALUES (${email}, ${name}, ${sha(`${email}:${code}`)}, ${input.ip}, ${TERMS_VERSION}, now() + make_interval(mins => ${CODE_MINUTES}))`
  // The email holds the code and nothing else.
  await send({ to: email, subject: `Your code: ${code}`, text: `Your Anker code is ${code}\n\nIt is valid for ${CODE_MINUTES} minutes. If you did not ask to sign up, ignore this email: nothing is created without this code.` })
  return { sentTo: maskEmail(email), expiresInMinutes: CODE_MINUTES }
}

export async function verifySignup(input: { email: unknown; code: unknown; password: unknown }, admin: () => AdminAuth): Promise<{ email: string; userId: string }> {
  if (!(await signupOpen())) throw CLOSED()
  const email = String(input.email ?? "").trim().toLowerCase(), c = String(input.code ?? "").replace(/\s+/g, ""), pw = String(input.password ?? "")
  if (!EMAIL.test(email)) throw new InvestorError("Enter a valid email address.")
  if (!/^\d{6}$/.test(c)) throw new InvestorError("Enter the six digits from the email.")
  const [row] = (await sql`SELECT id, name, code_hash, attempts, terms_version FROM investor_signup_codes WHERE lower(email) = ${email} AND used_at IS NULL AND expires_at > now() ORDER BY created_at DESC LIMIT 1`) as any[]
  if (!row) throw new InvestorError("That code has expired. Ask for a new one.", 400, "expired")
  if (Number(row.attempts) >= CODE_MAX_TRIES) throw new InvestorError("Too many wrong tries. Ask for a new code.", 429, "locked")
  await sql`UPDATE investor_signup_codes SET attempts = attempts + 1 WHERE id = ${row.id}`
  const a = Buffer.from(sha(`${email}:${c}`)), b = Buffer.from(String(row.code_hash))
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new InvestorError("That code is not right.", 400, "wrong")
  // The address is proved. Check the password before spending the code, so a weak one can be corrected without a new email.
  if (pw.length < MIN_PASSWORD) throw new InvestorError(`Choose a password of at least ${MIN_PASSWORD} characters.`)
  if (pw.length > 200 || pw.toLowerCase() === email) throw new InvestorError("Choose a different password.")
  const { data, error } = await admin().createUser({ email, password: pw, email_confirm: true, user_metadata: { full_name: row.name, role: "investor", via: "investor_signup" } })
  if (error) {
    if (/already been registered|already registered|exists/i.test(error.message)) throw new InvestorError("An account for this address already exists. Sign in, or reset your password.", 409, "exists")
    throw new InvestorError("The account could not be created. Please try again.", 502, "auth")
  }
  const userId = data.user?.id
  if (!userId) throw new InvestorError("The account could not be created. Please try again.", 502, "auth")
  await sql`UPDATE investor_signup_codes SET used_at = now() WHERE id = ${row.id}`
  await sql`INSERT INTO investor_profiles (user_id, display_name, terms_version, terms_accepted_at) VALUES (${userId}, ${row.name}, ${row.terms_version}, now()) ON CONFLICT (user_id) DO NOTHING`
  await sql`INSERT INTO investor_entities (user_id, legal_name, kind) VALUES (${userId}, ${row.name}, 'individual')`
  await sql`INSERT INTO profiles (id, email, full_name) VALUES (${userId}, ${email}, ${row.name}) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`.catch((e) => console.error("[investor-signup] profiles mirror failed:", e?.message))
  return { email, userId }
}
