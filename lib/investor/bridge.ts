/**
 * From a conversation to onboarding (docs/architecture/66): the fund invites an investor it is talking to, which makes the fund's investor record (doc 60) and starts its
 * invitation; the relationship's stage then follows the onboarding.
 */
import { sql } from "@/lib/db"
import { InvestorError } from "./profile"

const LP_TYPE: Record<string, string | null> = { individual: "hnwi", company: "corporate", fund: "fund_of_funds", family_office: "family_office", trust: null }
const NEXT: Record<string, string> = {
  not_invited: "Waiting for the fund's invitation email.", invited: "Open the personal link in the email the fund sent you.", opened: "Confirm your details.", details_confirmed: "Accept the terms.",
  terms_accepted: "Send your identity documents.", verification_submitted: "Return the signed subscription.", subscription_returned: "Waiting for the fund to countersign.", countersigned: "You are an investor in this fund.",
}
export const nextStepFor = (state: string | null | undefined) => (state ? NEXT[state] ?? "Continue in your onboarding." : null)

type Send = (m: { to: string; subject: string; text: string }) => Promise<void>

/** Make the stages follow the onboarding. One statement; safe to run any time, for one fund or all. */
export async function syncStages(fundId?: string): Promise<number> {
  const rows = (await sql`UPDATE fund_relationships r SET stage = CASE WHEN l.onboarding_state = 'countersigned' THEN 'active' ELSE 'onboarding' END, updated_at = now()
    FROM fund_lps l WHERE l.id = r.fund_lp_id AND (${fundId ?? null}::text IS NULL OR r.fund_id = ${fundId ?? null})
      AND r.stage IN ('invited_to_onboard', 'onboarding')
      AND ((l.onboarding_state = 'countersigned' AND r.stage <> 'active') OR (l.onboarding_state NOT IN ('not_invited', 'invited', 'countersigned') AND r.stage = 'invited_to_onboard') OR (l.onboarding_state = 'opened' AND r.stage = 'invited_to_onboard'))
    RETURNING r.id`) as any[]
  return rows.length
}

export async function inviteToOnboard(fundId: string, relId: string, by: string, appUrl: string, send?: Send): Promise<{ lpId: string; stage: string; emailSent: boolean; sentTo: string | null; emailError: string | null }> {
  const [r] = (await sql`SELECT r.id, r.stage, r.fund_lp_id, r.entity_id, r.user_id, e.legal_name, e.kind, p.email
    FROM fund_relationships r JOIN investor_entities e ON e.id = r.entity_id LEFT JOIN profiles p ON p.id::text = e.user_id
    WHERE r.id::text = ${relId} AND r.fund_id = ${fundId}`) as any[]
  if (!r) throw new InvestorError("That request was not found.", 404, "not_found")
  if (r.fund_lp_id || r.stage !== "in_talks") throw new InvestorError(r.stage === "in_talks" ? "This investor has already been invited." : "You can invite an investor once you have accepted their request and are talking.", 409, "stage")
  if (!r.email) throw new InvestorError("This investor has no email address on file, so they cannot be invited.", 422, "no_email")
  let lpId: string
  try {
    const [lp] = (await sql`INSERT INTO fund_lps (fund_id, lp_name, lp_type, status, subscription_status, contact_email, contact_name, metadata, created_at, updated_at)
      VALUES (${fundId}, ${r.legal_name}, ${LP_TYPE[r.kind] ?? null}, 'committed', 'prospective', ${String(r.email).toLowerCase()}, ${r.legal_name}, ${JSON.stringify({ source: "investor_relationship", relationshipId: String(r.id) })}::jsonb, now(), now()) RETURNING id`) as any[]
    lpId = String(lp.id)
    const linked = (await sql`UPDATE fund_relationships SET fund_lp_id = ${lpId}, stage = 'invited_to_onboard', decided_by = COALESCE(decided_by, ${by}), updated_at = now() WHERE id = ${r.id} AND stage = 'in_talks' AND fund_lp_id IS NULL RETURNING id`) as any[]
    if (!linked.length) { await sql`DELETE FROM fund_lps WHERE id = ${lpId}`; throw new InvestorError("This investor has already been invited.", 409, "stage") }
  } catch (e: any) {
    if (e?.code === "23505") throw new InvestorError("This investor has already been invited.", 409, "stage")
    throw e
  }
  const { inviteLp } = await import("@/lib/portfolio/lp-onboarding")
  try {
    const out = await (send ? inviteLp(lpId, by, appUrl, send) : inviteLp(lpId, by, appUrl))
    return { lpId, stage: "invited_to_onboard", emailSent: true, sentTo: out.sentTo, emailError: null }
  } catch (e: any) {
    return { lpId, stage: "invited_to_onboard", emailSent: false, sentTo: null, emailError: String(e?.message ?? "The email could not be sent.").slice(0, 200) }
  }
}
