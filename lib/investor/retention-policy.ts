/**
 * The retention periods of the investor side, as data (docs/architecture/73 section 3). Pure, so the counsel pack is generated from the same numbers the daily job uses.
 * Every period is PROPOSED, for counsel to confirm.
 */
export const RETENTION = {
  signupCodesDays: 1, claimCodesDays: 1,
  closedTeamInviteDays: 30,
  fundInviteExpireDays: 30, fundInviteCardWipeDays: 180,
  archivedEntityPassportDays: 30, supersededPassportDays: 30,
  closedAttachmentsDays: 365,
  eventsDays: 1095,
} as const

export interface PolicyRow { key: string; data: string; period: string; then: string }
export const POLICY: PolicyRow[] = [
  { key: "signup_codes", data: "A pending sign-up (address, name, hashed code)", period: `${RETENTION.signupCodesDays} day after it was asked for`, then: "Deleted" },
  { key: "claim_codes", data: "A pending code to link a record a fund added", period: `${RETENTION.claimCodesDays} day`, then: "Deleted" },
  { key: "team_invites", data: "Answered, revoked and expired team invitations (an email address)", period: `${RETENTION.closedTeamInviteDays} days after they closed`, then: "Deleted" },
  { key: "fund_invites_expire", data: "A fund's discoverability invitation nobody answered", period: `${RETENTION.fundInviteExpireDays} days`, then: "Closed as withdrawn" },
  { key: "fund_invite_cards", data: "The card a fund saw, kept on an answered invitation", period: `${RETENTION.fundInviteCardWipeDays} days after the answer`, then: "The card is emptied; the fact and date of the invitation stay (they enforce the 90-day wait after a decline)" },
  { key: "passport_archived", data: "Identity documents in the passport of an entity that was archived", period: `${RETENTION.archivedEntityPassportDays} days after archiving`, then: "File contents wiped" },
  { key: "passport_superseded", data: "A replaced passport record that was never shared", period: `${RETENTION.supersededPassportDays} days`, then: "Deleted (the bytes were wiped when it was replaced)" },
  { key: "attachments_closed", data: "Files attached to messages in a conversation that ended (declined or withdrawn)", period: `${RETENTION.closedAttachmentsDays} days after it ended`, then: "Files deleted; the messages stay" },
  { key: "entity_events", data: "The entity's activity log (who did what)", period: `${RETENTION.eventsDays} days (three years)`, then: "Deleted" },
]
export const KEPT_BY_DESIGN = [
  "A fund's relationship record with an investor, and the fund's own messages: these are the fund's records, under the fund's own retention. They are anonymised if the investor asks for erasure.",
  "Anything a fund has already checked in its onboarding (identity documents, subscription documents): the fund's legal records.",
  "The investor's profile, entities, messages and passport while the account exists: kept until the person deletes them or erases the account.",
  "Audit-log entries about sharing and erasure, which hold no document content or personal text.",
]

export function retentionMarkdown(): string {
  const out = ["# 08. Retention as configured (generated)", "", "*Generated from `lib/investor/retention-policy.ts`, the numbers the daily job (`/api/cron/investor-retention`) uses. Every period is **proposed, for counsel to confirm**. Do not edit by hand: change the policy file and regenerate with `npx tsx scripts/legal/gen-investor-pack.ts`; a test fails if this file differs.*", "", "| Data | Kept for | Then |", "| --- | --- | --- |", ...POLICY.map((p) => `| ${p.data} | ${p.period} | ${p.then} |`), "", "## Not removed by the job, by design", "", ...KEPT_BY_DESIGN.map((k) => `- ${k}`), ""]
  return out.join("\n")
}
