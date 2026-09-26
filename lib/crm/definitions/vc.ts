/**
 * VC CRM — tracking LPs through a fund close.
 *
 * Scope boundary (doc 25 §2): this is capital coming *in*. A VC's inbound
 * startup deal flow already lives in fund operations — `portfolio_companies`,
 * `deal_founders`, `deal_documents` and the fund `deals` routes, with their own
 * IC votes, memos and document sets. It is deliberately not modelled here.
 * Duplicating a deal into the CRM would create two records of one thing, and
 * the CRM copy is the one that goes stale.
 *
 * `soft_circle` is a real stage rather than a note on the record: a verbal
 * commitment that has not been papered is the single most useful number in a
 * fund raise, and folding it into "Committed" overstates the close.
 */
import type { CrmDefinition } from "./types"

export const vcCrm: CrmDefinition = {
  persona: "vc",

  company: { one: "Institution", many: "Institutions" },
  person: { one: "Allocator", many: "Allocators" },
  deal: { one: "Commitment", many: "Commitments" },

  stages: [
    { key: "queued", label: "Sourced", kind: "open", hint: "Identified as a possible LP." },
    { key: "contacted", label: "Outreach sent", kind: "open" },
    { key: "responded", label: "Qualified", kind: "open", hint: "Replied and worth pursuing." },
    { key: "meeting", label: "Meeting", kind: "open" },
    { key: "diligence", label: "Data room", kind: "open", hint: "Working through the DDQ." },
    { key: "soft_circle", label: "Soft circle", kind: "open", hint: "Verbal, not yet papered." },
    { key: "committed", label: "Committed", kind: "won", hint: "Subscription documents signed." },
    { key: "declined", label: "Declined", kind: "lost" },
  ],

  sources: ["lp_matching", "manual", "import"],

  emptyState: {
    title: "No LPs yet",
    body: "Run an LP match against your fund profile, or add an institution by hand.",
  },
}
