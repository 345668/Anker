/**
 * User-specified matchmaking filters.
 * Doc: docs/architecture/26-matchmaking-filters.md
 *
 * One shape for both engines, both routes and the UI. A founder choosing which
 * investors to approach and a GP choosing which LPs to raise from are the same
 * act against different halves of the directory, so they share this.
 *
 * These are **constraints, not preferences** (§2.1). "Only the US" means a record
 * outside the US does not appear at any score. Scoring still ranks freely inside
 * what survives.
 *
 * The vocabularies are the platform's existing ones — the same `norm_class` and
 * `norm_region` columns the Discover page filters on — so a filter means the same
 * thing in both places and an agent has one vocabulary to learn.
 */
import { z } from "zod"
import { INVESTOR_CLASSES, CLASS_LABELS, ALLOCATOR_CLASSES, DIRECT_CLASSES, type InvestorClass } from "./normalize/classes"
import { REGION_LABELS, type Region } from "./normalize/geo"

export const REGIONS = Object.keys(REGION_LABELS) as Region[]

export interface MatchFilters {
  /** Empty = unconstrained. Never "match nothing". */
  regions: Region[]
  classes: InvestorClass[]
  /** ISO country codes, for narrowing inside a region. */
  countries: string[]
  excludeClasses: InvestorClass[]
}

export const EMPTY_FILTERS: MatchFilters = { regions: [], classes: [], countries: [], excludeClasses: [] }

export const matchFiltersSchema = z.object({
  regions: z.array(z.enum(REGIONS as [Region, ...Region[]])).max(REGIONS.length).optional(),
  classes: z.array(z.enum(INVESTOR_CLASSES)).max(INVESTOR_CLASSES.length).optional(),
  countries: z.array(z.string().trim().min(2).max(4)).max(60).optional(),
  excludeClasses: z.array(z.enum(INVESTOR_CLASSES)).max(INVESTOR_CLASSES.length).optional(),
})

export function parseFilters(input: unknown): MatchFilters {
  const p = matchFiltersSchema.safeParse(input ?? {})
  if (!p.success) return EMPTY_FILTERS
  const uniq = <T,>(a: T[] | undefined) => Array.from(new Set(a ?? []))
  return {
    regions: uniq(p.data.regions),
    classes: uniq(p.data.classes),
    // Normalise case BEFORE de-duplicating, or "us" and "US" both survive.
    countries: uniq((p.data.countries ?? []).map((c) => c.trim().toUpperCase())),
    excludeClasses: uniq(p.data.excludeClasses),
  }
}

export const hasFilters = (f: MatchFilters): boolean =>
  f.regions.length > 0 || f.classes.length > 0 || f.countries.length > 0 || f.excludeClasses.length > 0

/**
 * Parameters for the `IS NULL OR = ANY(...)` predicate the engines embed.
 *
 * An empty selection becomes `null`, which the predicate reads as "no constraint"
 * — distinct from an empty array, which would match nothing. That distinction is
 * the difference between "the user said nothing" and "the user excluded
 * everything", and an agent composing a mandate has to be able to express both.
 */
export function filterParams(f: MatchFilters) {
  return {
    regions: f.regions.length ? f.regions : null,
    classes: f.classes.length ? f.classes : null,
    countries: f.countries.length ? f.countries : null,
    excludeClasses: f.excludeClasses.length ? f.excludeClasses : null,
  }
}

/** The classes worth offering each persona (§5). */
export function classesForPersona(persona: "founder" | "vc" | "lp"): InvestorClass[] {
  // A founder raising a round does not raise from a sovereign wealth fund; a GP
  // raising a fund does not raise from an accelerator.
  return persona === "founder" ? DIRECT_CLASSES : ALLOCATOR_CLASSES
}

/** The mandate in words, for a run header or an audit line. */
export function describeFilters(f: MatchFilters): string {
  if (!hasFilters(f)) return "No filters — the whole directory"
  const parts: string[] = []
  if (f.regions.length) parts.push(f.regions.map((r) => REGION_LABELS[r]).join(" · "))
  if (f.countries.length) parts.push(f.countries.join(", "))
  if (f.classes.length) parts.push(f.classes.map((c) => CLASS_LABELS[c]).join(" · "))
  if (f.excludeClasses.length) parts.push(`excluding ${f.excludeClasses.map((c) => CLASS_LABELS[c]).join(" · ")}`)
  return parts.join(" — ")
}

export { CLASS_LABELS, REGION_LABELS, ALLOCATOR_CLASSES, DIRECT_CLASSES, INVESTOR_CLASSES }
export type { InvestorClass, Region }
