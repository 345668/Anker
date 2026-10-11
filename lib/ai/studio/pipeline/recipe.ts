/**
 * Pipeline recipes (docs/architecture/51). A recipe is an ordered list of stages. Some stages are people's decisions (gates), some call a paid model.
 * The runner enforces the rules that belong to a stage's kind, so no recipe can skip a review or start a paid call without an approval.
 */
export type StageKind =
  | "ingest"
  | "normalise"
  | "review_input"
  | "generate_draft"
  | "approve_final"
  | "generate_final"
  | "restore_audio"
  | "deliver"

export type Gate = "input" | "final"

/** Stages a person completes by reviewing: the runner never executes them. */
export const GATE_OF: Partial<Record<StageKind, Gate>> = { review_input: "input", approve_final: "final" }
/** Stages that spend money. They run only after the matching gate is approved for the exact files, and are never re-run automatically. */
export const PAID_STAGES: Partial<Record<StageKind, Gate>> = {
  generate_draft: "input",
  generate_final: "final",
}

export interface PipelineRecipe {
  id: string
  version: number
  name: string
  stages: StageKind[]
}

export const REPLACE_SUBJECT: PipelineRecipe = {
  id: "replace-subject",
  version: 1,
  name: "Replace a subject",
  stages: [
    "ingest",
    "normalise",
    "review_input",
    "generate_draft",
    "approve_final",
    "generate_final",
    "restore_audio",
    "deliver",
  ],
}

export const RECIPES: PipelineRecipe[] = [REPLACE_SUBJECT]
export const recipeById = (id: string) => RECIPES.find((r) => r.id === id)
