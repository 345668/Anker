/**
 * Management company + studio — pure constants (NO database imports).
 *
 * Safe to import from client components; the DB-backed functions live in
 * ./management-company (same pattern as deal-constants / ledger-constants).
 */

/** Budget categories — mirrors the OpEx Pro-Forma tool's departments. */
export const MC_CATEGORIES = [
  "Salaries & benefits", "EIRs / venture builders", "Office & operations",
  "Legal & compliance", "Fund administration", "Audit & tax", "Travel",
  "Software & data", "Marketing & events", "Insurance", "Other",
] as const

export const STUDIO_STAGES = ["idea", "validation", "build", "spun_out", "archived"] as const
export type StudioStage = (typeof STUDIO_STAGES)[number]

/** Forward transitions. spun_out is only reachable via spinoutProject(). */
export const STUDIO_NEXT: Record<StudioStage, StudioStage[]> = {
  idea:       ["validation", "archived"],
  validation: ["build", "archived"],
  build:      ["spun_out", "archived"],
  spun_out:   [],
  archived:   ["idea"],
}
