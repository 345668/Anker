/**
 * The CRM definition registry.
 *
 * Doc: docs/architecture/25-per-persona-crm.md
 *
 * One entry per persona. `definitionFor()` is the only way the engine obtains a
 * definition, so a persona that has none fails loudly here rather than
 * rendering a CRM with an empty pipeline.
 */
import { founderCrm } from "./founder"
import { vcCrm } from "./vc"
import { lpCrm } from "./lp"
import { assertDefinition, type CrmDefinition, type CrmPersona } from "./types"

export * from "./types"
export { founderCrm, vcCrm, lpCrm }

const DEFINITIONS: Record<CrmPersona, CrmDefinition> = {
  founder: founderCrm,
  vc: vcCrm,
  lp: lpCrm,
}

/**
 * Personas whose CRM is served by the definition engine.
 *
 * Founder landed in phase 3, VC in phase 5. LP remains off because it has no CRM
 * at all yet — `lib/crm/workspace.ts` admits only founder and VC workspaces, and
 * doc 01 has to give an LP a workspace before there is an `org_id` to scope rows
 * to. This list is the switch phase 6 flips, and it exists so "which personas are
 * live" is one readable line rather than a condition spread across routes.
 */
export const ENGINE_PERSONAS: readonly CrmPersona[] = ["founder", "vc"]

/** Narrows, so a caller can pass the result straight to `definitionFor`. */
export function isEnginePersona(persona: string | null | undefined): persona is CrmPersona {
  return !!persona && (ENGINE_PERSONAS as readonly string[]).includes(persona)
}

export function definitionFor(persona: CrmPersona): CrmDefinition {
  const def = DEFINITIONS[persona]
  if (!def) throw new Error(`No CRM definition for persona "${persona}".`)
  return def
}

export function allDefinitions(): CrmDefinition[] {
  return Object.values(DEFINITIONS)
}

/**
 * Validate every definition when not running in production.
 *
 * The invariants in `assertDefinition` catch edits that are cheap to make and
 * expensive to notice — a duplicated stage key, a pipeline with no lost state.
 * Running them at import time in dev and test means a bad definition fails on
 * the first page load rather than in a funnel chart three weeks later. Skipped
 * in production so a deploy is never taken down by a definition that a test
 * would already have rejected.
 */
if (process.env.NODE_ENV !== "production") {
  for (const def of Object.values(DEFINITIONS)) assertDefinition(def)
}
