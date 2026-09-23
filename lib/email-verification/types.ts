/** Email verification vocabulary (docs/architecture/13 §3). */

export type VerificationStatus = "valid" | "risky" | "unknown" | "invalid"

export interface Verification {
  email: string
  status: VerificationStatus
  /** Sub-status: catch_all, role, disposable, no_mx, syntax, mailbox, bounced, suppressed … */
  reason: string | null
  /** "local" for stage 1; the provider id for stage 2. */
  provider: string
  mxFound: boolean | null
  checkedAt: string
}

/** What a person reads. Only a provider-confirmed mailbox is "Verified". */
export const STATUS_LABEL: Record<VerificationStatus | "unchecked", string> = {
  valid: "Verified",
  risky: "Risky",
  unknown: "Unconfirmed",
  invalid: "Invalid",
  unchecked: "Not checked",
}

export function statusLabel(status: VerificationStatus | null | undefined): string {
  return STATUS_LABEL[status ?? "unchecked"]
}

/** May be emailed: verified, or unconfirmed with a mail-accepting domain. Never invalid. */
export function isSendable(status: VerificationStatus | null | undefined): boolean {
  return status === "valid" || status === "unknown" || status === "risky"
}

/** Doc 11 §4.7 / §5: how much a contact's email counts toward evidence and contact rank. */
export function emailQuality(status: VerificationStatus | null | undefined, hasEmail: boolean): number {
  if (!hasEmail || status === "invalid") return 0
  if (status === "valid") return 1
  if (status === "risky") return 0.45
  return 0.6 // unknown, or not yet checked
}

export function normEmail(email: string | null | undefined): string | null {
  const e = (email ?? "").trim().toLowerCase()
  return e && e.includes("@") ? e : null
}
