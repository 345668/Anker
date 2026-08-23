/**
 * Contract review playbook — the standard positions an incoming contract is measured
 * against. Each clause has a market-standard position and the deviations that should be
 * flagged, weighted by how much they matter. The analyzer (lib/contracts/analyzer) feeds
 * this to the model to ground its review, and the deterministic risk score is computed
 * from the weights here — so the playbook, not the model, sets what "risk" means.
 *
 * This is a sensible default for early-stage / venture contracts (NDA, MSA, SAFE, side
 * letters, subscription docs). It's a starting position, not legal advice — a lawyer owns
 * the final call.
 */

export interface PlaybookClause {
  id: string
  label: string
  /** What a market-standard version of this clause looks like. */
  standard: string
  /** Deviations to flag. */
  redFlags: string[]
  /** Relative weight of a deviation on this clause (1 = minor, 3 = material, 5 = dealbreaker). */
  weight: 1 | 2 | 3 | 5
}

export const PLAYBOOK: PlaybookClause[] = [
  { id: "parties", label: "Parties & recitals", weight: 1,
    standard: "Correct legal entity names, jurisdictions of incorporation, and a clear statement of purpose.",
    redFlags: ["Wrong or missing legal entity name", "Individual named where an entity should be", "No stated purpose"] },
  { id: "term_termination", label: "Term & termination", weight: 3,
    standard: "Defined term with termination for convenience on reasonable notice (30–90 days) and termination for cause with a cure period.",
    redFlags: ["No termination for convenience", "Automatic multi-year renewal (evergreen) without an easy opt-out", "No cure period for breach", "Unilateral termination rights for the counterparty only"] },
  { id: "confidentiality", label: "Confidentiality", weight: 3,
    standard: "Mutual, defined confidential information, standard carve-outs (public, independently developed, required by law), 2–5 year survival.",
    redFlags: ["One-way / non-mutual confidentiality", "No standard carve-outs", "Perpetual confidentiality on all information", "Residuals clause favouring the counterparty"] },
  { id: "ip_ownership", label: "IP ownership", weight: 5,
    standard: "Each party keeps its background IP; foreground IP allocated per the deal; no assignment of the company's core IP.",
    redFlags: ["Assignment of company background or core IP", "Counterparty owns jointly-developed IP", "Broad licence-back of company IP", "Feedback clause assigning improvements to the counterparty"] },
  { id: "liability", label: "Limitation of liability", weight: 5,
    standard: "Mutual liability cap (fees paid, or 12 months' fees) with a consequential-damages waiver; carve-outs for confidentiality, IP indemnity, and gross negligence only.",
    redFlags: ["Uncapped liability", "One-sided cap favouring the counterparty", "No consequential-damages waiver", "Overbroad carve-outs that swallow the cap"] },
  { id: "indemnity", label: "Indemnification", weight: 3,
    standard: "Mutual, scoped to third-party claims (IP infringement, breach, negligence) with control-of-defence and notice provisions.",
    redFlags: ["One-way indemnity running from the company only", "Indemnity for first-party losses", "No cap or notice/defence procedure", "Indemnity for the counterparty's own negligence"] },
  { id: "payment", label: "Payment & fees", weight: 2,
    standard: "Clear amounts, net-30 to net-60 terms, defined late-fee cap; no unilateral price increases mid-term.",
    redFlags: ["Payment terms under net-15", "Unilateral price increases", "Auto-draft / auto-charge without notice", "Non-refundable prepayments with no service credit"] },
  { id: "warranties", label: "Warranties", weight: 2,
    standard: "Limited, mutual warranties (authority, no conflict, services performed in a workmanlike manner); everything else disclaimed.",
    redFlags: ["Broad uncapped performance warranties on the company", "No disclaimer of implied warranties", "Fitness-for-purpose warranty the company can't stand behind"] },
  { id: "assignment", label: "Assignment & change of control", weight: 2,
    standard: "No assignment without consent, except to an affiliate or in a merger / change of control (assignment freely permitted there).",
    redFlags: ["No change-of-control carve-out (blocks an acquisition)", "Counterparty may assign freely but the company may not", "Consent that can be unreasonably withheld"] },
  { id: "non_solicit", label: "Non-solicit / non-compete", weight: 3,
    standard: "Narrow, mutual non-solicit of directly-involved staff for 6–12 months; no non-compete on the company's business.",
    redFlags: ["Any non-compete restricting the company's business", "Broad non-solicit covering all employees", "Non-solicit longer than 12 months", "Non-solicit that is one-way against the company"] },
  { id: "governing_law", label: "Governing law & disputes", weight: 1,
    standard: "A neutral or home jurisdiction, courts or arbitration specified, each party bearing its own costs.",
    redFlags: ["Inconvenient foreign jurisdiction", "Mandatory arbitration in the counterparty's home venue", "Loser-pays fee-shifting against the company only"] },
  { id: "data_privacy", label: "Data protection", weight: 3,
    standard: "A DPA where personal data is processed, GDPR/CCPA terms, breach-notice obligations, sub-processor controls.",
    redFlags: ["Personal data processed with no DPA", "No breach-notification obligation", "Unlimited sub-processing rights", "Data used for the counterparty's own purposes"] },
]

export const PLAYBOOK_BY_ID: Record<string, PlaybookClause> = Object.fromEntries(PLAYBOOK.map((c) => [c.id, c]))

/** Compact playbook text for the analyzer prompt. */
export function playbookPromptBlock(): string {
  return PLAYBOOK.map((c) =>
    `- ${c.id} (${c.label}, weight ${c.weight}): STANDARD — ${c.standard} RED FLAGS — ${c.redFlags.join("; ")}.`,
  ).join("\n")
}
