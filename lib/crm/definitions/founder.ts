/**
 * Founder CRM — tracking investors through a raise.
 *
 * The first persona to be built on the definition layer (doc 25 §5, phase 1–3).
 *
 * `queued` is deliberately the entry stage and not re-keyed: it is the value
 * lib/matching/v2/founder-engine.ts:86 checks to stop re-surfacing an investor
 * the founder already has in the CRM. Relabelling it to "Researching" is free;
 * renaming the key would quietly break that exclusion and the founder would
 * start seeing duplicates of rows they already hold.
 */
import type { CrmDefinition } from "./types"

export const founderCrm: CrmDefinition = {
  persona: "founder",

  company: { one: "Firm", many: "Firms" },
  person: { one: "Investor", many: "Investors" },
  deal: { one: "Round", many: "Rounds" },

  stages: [
    { key: "queued", label: "Researching", kind: "open", hint: "In the pipeline, not yet approached." },
    { key: "contacted", label: "Intro sent", kind: "open" },
    { key: "responded", label: "In conversation", kind: "open" },
    { key: "meeting", label: "Pitched", kind: "open", hint: "Call or meeting held." },
    { key: "diligence", label: "Diligence", kind: "open", hint: "Reading the deck, asking for data." },
    { key: "term_sheet", label: "Term sheet", kind: "open" },
    { key: "committed", label: "Closed", kind: "won", hint: "Signed and in the round." },
    { key: "passed", label: "Passed", kind: "lost" },
  ],

  sources: ["founder_matching", "manual", "import"],

  emptyState: {
    title: "No investors yet",
    body: "Run a match to find investors who fit your round, or add a firm by hand.",
  },
}
