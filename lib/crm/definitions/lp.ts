/**
 * LP CRM — tracking funds and their managers through an allocation.
 *
 * This persona has no CRM at all today: lib/crm/workspace.ts:7 admits a
 * `founder` company workspace or a `vc` fund workspace and nothing else, so an
 * LP cannot open the CRM. Shipping this definition is therefore blocked on doc
 * 01 (LP workspace provisioning) — an LP with no workspace of their own has no
 * `org_id` to scope rows to. It is written now so the definition layer is shaped
 * by three personas rather than one (doc 25 §9).
 *
 * `soft_circle` carries the LP reading: the investment committee. Same column
 * value, same position in the funnel, different word — which is the whole point
 * of keeping keys canonical and labels per-persona.
 *
 * "Re-up" is intentionally absent. A re-up is a *new* allocation into a later
 * vintage of a fund already committed to, not a stage after committing — a
 * later record with its own pipeline, not a fifteenth column on this one.
 */
import type { CrmDefinition } from "./types"

export const lpCrm: CrmDefinition = {
  persona: "lp",

  company: { one: "Manager", many: "Managers" },
  person: { one: "GP", many: "GPs" },
  deal: { one: "Allocation", many: "Allocations" },

  stages: [
    { key: "queued", label: "Watchlist", kind: "open", hint: "Tracking, no contact yet." },
    { key: "contacted", label: "Reached out", kind: "open" },
    { key: "responded", label: "In conversation", kind: "open" },
    { key: "meeting", label: "First meeting", kind: "open" },
    { key: "diligence", label: "Diligence", kind: "open", hint: "Track record, terms, references." },
    { key: "soft_circle", label: "IC", kind: "open", hint: "With the investment committee." },
    { key: "committed", label: "Committed", kind: "won" },
    { key: "passed", label: "Passed", kind: "lost" },
  ],

  sources: ["manual", "import"],

  emptyState: {
    title: "No managers yet",
    body: "Add a fund you are tracking, or import a list of managers.",
  },
}
