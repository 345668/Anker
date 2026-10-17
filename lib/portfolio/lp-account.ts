import { sql } from "@/lib/db"
import { LpError, lpEmail } from "./lp-onboarding"

/**
 * The investor's optional account (docs/architecture/60 section 4). It can be made only from inside a portal session that has entered the emailed code, which is what
 * proves the address belongs to the investor, and it is tied to that investor's row. The portal stays the main door; the account exists for people with several funds.
 *   - first fund: they choose a password and an account is made for that address
 *   - another fund, same address: they just add it to the account they already have (no new password)
 *   - an account for that address that we did not make: we do not touch it, and say so
 */
export const MIN_PASSWORD = 10
export interface AccountState { state: "none" | "linked"; email: string | null; others: number }

export async function accountState(lpId: string): Promise<AccountState> {
  const who = await lpEmail(lpId)
  const [mine] = (await sql`SELECT 1 AS x FROM lp_accounts WHERE lp_id = ${lpId}`) as any[]
  const [others] = who?.email ? ((await sql`SELECT count(*)::int AS n FROM lp_accounts WHERE lower(email) = ${who.email}`) as any[]) : [{ n: 0 }]
  return { state: mine ? "linked" : "none", email: who?.email ?? null, others: Number(others?.n ?? 0) }
}

export interface AdminAuth { createUser(a: { email: string; password: string; email_confirm: boolean; user_metadata: Record<string, unknown> }): Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }> }

/** Makes the account (or links this investor to the account made for the same address). Never signs anyone in. */
export async function enableAccount(lpId: string, password: unknown, admin: () => AdminAuth): Promise<{ created: boolean; email: string }> {
  const who = await lpEmail(lpId)
  if (!who?.email) throw new LpError("This portal has no email address on file, so an account cannot be made.", 422, "no_email")
  const [already] = (await sql`SELECT 1 AS x FROM lp_accounts WHERE lp_id = ${lpId}`) as any[]
  if (already) throw new LpError("This investment is already on your account. Sign in to use it.", 409, "linked")
  const [other] = (await sql`SELECT user_id FROM lp_accounts WHERE lower(email) = ${who.email} LIMIT 1`) as any[]
  if (other) {
    await sql`INSERT INTO lp_accounts (lp_id, fund_id, user_id, email) VALUES (${lpId}, ${who.fundId}, ${String(other.user_id)}, ${who.email}) ON CONFLICT (lp_id) DO NOTHING`
    return { created: false, email: who.email }
  }
  const pw = String(password ?? "")
  if (pw.length < MIN_PASSWORD) throw new LpError(`Choose a password of at least ${MIN_PASSWORD} characters.`)
  if (pw.toLowerCase() === who.email || pw.length > 200) throw new LpError("Choose a different password.")
  const { data, error } = await admin().createUser({ email: who.email, password: pw, email_confirm: true, user_metadata: { full_name: who.name ?? who.lpName, role: "lp", via: "lp_portal" } })
  if (error) {
    if (/already been registered|already registered|exists/i.test(error.message)) throw new LpError("An account for this address already exists, made some other way. Sign in with it, or contact the fund to have it linked.", 409, "exists")
    throw new LpError("The account could not be created. Please try again.", 502, "auth")
  }
  const userId = data.user?.id
  if (!userId) throw new LpError("The account could not be created. Please try again.", 502, "auth")
  await sql`INSERT INTO lp_accounts (lp_id, fund_id, user_id, email) VALUES (${lpId}, ${who.fundId}, ${userId}, ${who.email}) ON CONFLICT (lp_id) DO NOTHING`
  await sql`INSERT INTO profiles (id, email, full_name) VALUES (${userId}, ${who.email}, ${who.name ?? who.lpName}) ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email`.catch((e) => console.error("[lp-account] profiles mirror failed:", e?.message))
  return { created: true, email: who.email }
}
