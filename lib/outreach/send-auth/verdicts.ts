/** Verdict codes and their plain-language text. Client-safe (no Node imports): the review dialog imports this. docs/architecture/46 §4. */
export type VerdictCode =
  | "ok" | "suppressed" | "country_gated" | "bad_address" | "no_recipient" | "no_subject" | "no_body" | "not_email" | "cancelled"
  | "already_sent" | "already_replied" | "bounced" | "follow_ups_paused" | "stage_passed" | "in_other_authorization" | "wrong_sender" | "duplicate_recent" | "duplicate_in_batch" | "not_found"

export interface Verdict { code: VerdictCode; detail?: string }
export const SENDABLE: VerdictCode = "ok"

export const VERDICT_TEXT: Record<VerdictCode, string> = {
  ok: "Ready", suppressed: "Opted out or on the do-not-send list", country_gated: "Needs recorded consent (recipient is in a gated country)", bad_address: "Not a deliverable address",
  no_recipient: "No email address", no_subject: "No subject", no_body: "No body", not_email: "Not an email message", cancelled: "Cancelled",
  already_sent: "Already sent", already_replied: "They have already replied", bounced: "Bounced or complained earlier", follow_ups_paused: "Follow-ups are paused for this contact",
  stage_passed: "The contact is marked passed", in_other_authorization: "Already approved in another batch", wrong_sender: "This draft belongs to another sender",
  duplicate_recent: "A message to this address went out in the last 24 hours", duplicate_in_batch: "Another message to this address is in this batch; only the first step goes now", not_found: "Not in this workspace. Switch to the workspace this message belongs to",
}

