/**
 * The CRM definition layer — one engine, one definition per persona.
 *
 * Doc: docs/architecture/25-per-persona-crm.md
 *
 * A founder's CRM, a VC's CRM and an LP's CRM are different entities (doc 00),
 * and they differ in vocabulary and pipeline rather than in mechanism. Rather
 * than branching on persona inside each page — which is what the CRM does today
 * — each persona supplies a definition and the engine renders whatever the
 * definition says.
 *
 * ── Why stage KEYS are canonical and only LABELS vary ──────────────────────
 *
 * `crm_entries.stage` is free text today, and the vocabulary has already forked
 * across the codebase:
 *
 *   lib/crm/shortlist.ts             queued · contacted · responded · meeting ·
 *                                    in_diligence · committed · passed
 *   lib/matching/v2/types.ts         identified · researched · contacted ·
 *                                    responded · meeting · diligence ·
 *                                    soft_circle · committed · wired ·
 *                                    declined · lost
 *   components/webmcp/crm-tools.tsx  …engaged, diligence  (disagrees with both)
 *
 * Three consumers read those strings *semantically*:
 *
 *   lib/matching/outcome-events.ts   stageToOutcome() → the learned ranker's
 *                                    training labels
 *   lib/matching/v2/ranker-fit.ts    POSITIVE_STAGES / NEGATIVE_STAGES
 *   lib/matching/v2/founder-engine.ts  `stage === "queued"` excludes a row
 *                                    from being re-surfaced
 *
 * So a definition that invented its own keys ("pitched", "term_sheet" as a new
 * value) would add a *fourth* vocabulary and silently degrade ranker training
 * — silently because an unrecognised stage maps to `null`, which is not an
 * error, just a missing label. Persona definitions therefore pick from
 * CANONICAL_STAGES and re-label them. "Pitched" and "Sourced" are the same
 * column value wearing different words.
 */

export type CrmPersona = "founder" | "vc" | "lp"

/**
 * Every stage key the existing consumers above already understand, in rough
 * pipeline order. A definition may use a subset and may re-label freely, but
 * may not introduce a key outside this set — `assertDefinition` enforces it.
 *
 * `diligence` is canonical; `in_diligence` is the legacy spelling written by
 * lib/crm/shortlist.ts and is handled as an alias (see STAGE_ALIASES) rather
 * than a second key, because ranker-fit.ts already treats them as equivalent.
 */
export const CANONICAL_STAGES = [
  "queued",
  "identified",
  "researched",
  "contacted",
  "responded",
  "meeting",
  "diligence",
  "soft_circle",
  "term_sheet",
  "committed",
  "wired",
  "passed",
  "declined",
  "lost",
] as const

export type CanonicalStage = (typeof CANONICAL_STAGES)[number]

/**
 * Legacy and synonym spellings found in the live column, mapped onto canonical
 * keys. Kept here so the migration (doc 25 §6) and the engine agree on one
 * answer, and so adding an alias does not mean editing three modules.
 */
export const STAGE_ALIASES: Record<string, CanonicalStage> = {
  in_diligence: "diligence",
  due_diligence: "diligence",
  replied: "responded",
  engaged: "responded",
  rejected: "declined",
  closed: "committed",
  closed_won: "committed",
  closed_lost: "declined",
  prospect: "queued",
}

/**
 * Whether a stage is still being worked, or is a terminal outcome.
 *
 * A pipeline with no explicit lost state inflates every conversion metric it
 * reports, because rows that died are indistinguishable from rows still open.
 * Each definition must declare at least one `won` and one `lost`.
 */
export type StageKind = "open" | "won" | "lost"

export type CrmStage = {
  /** The value stored in the column. Shared across personas. */
  key: CanonicalStage
  /** What this persona calls it. */
  label: string
  kind: StageKind
  /** Optional one-line explanation surfaced in the UI. */
  hint?: string
}

/** Persona wording for a thing. `one` is singular, `many` plural. */
export type Noun = { one: string; many: string }

export type CrmDefinition = {
  persona: CrmPersona

  /** The counterparty organisation: Firm / Institution / Manager. */
  company: Noun
  /** A human at one: Partner / Allocator / GP. */
  person: Noun
  /** What is being pursued: Round / Commitment / Allocation. */
  deal: Noun

  /**
   * The pipeline, in board order. Terminal stages sort last regardless of
   * their position here, but keeping them last is clearer to read.
   */
  stages: readonly CrmStage[]

  /**
   * Which `crm_entries.source` values legitimately produce rows for this
   * persona. Used by the importer and to keep a founder's matching run from
   * landing in a VC board.
   */
  sources: readonly string[]

  /** Shown when the CRM is empty, in this persona's language. */
  emptyState: { title: string; body: string }
}

// ─── Derived helpers ────────────────────────────────────────────────────────

const CANONICAL_SET: ReadonlySet<string> = new Set(CANONICAL_STAGES)

export function isCanonicalStage(value: string): value is CanonicalStage {
  return CANONICAL_SET.has(value)
}

/**
 * Resolve a raw column value to a canonical key: itself if already canonical,
 * its alias if known, otherwise null.
 *
 * Returns null rather than guessing a default. A row whose stage cannot be
 * resolved is a migration finding (doc 25 §6 rule 1), and defaulting it to
 * "queued" here would hide exactly the rows the migration report exists to
 * surface.
 */
export function canonicalizeStage(raw: string | null | undefined): CanonicalStage | null {
  const v = (raw ?? "").trim().toLowerCase()
  if (!v) return null
  if (isCanonicalStage(v)) return v
  return STAGE_ALIASES[v] ?? null
}

/** The stage a definition treats as the entry point for a new record. */
export function initialStage(def: CrmDefinition): CrmStage {
  const first = def.stages.find((s) => s.kind === "open")
  if (!first) throw new Error(`CRM definition "${def.persona}" has no open stage.`)
  return first
}

export function stageByKey(def: CrmDefinition, key: string): CrmStage | null {
  const canonical = canonicalizeStage(key)
  if (!canonical) return null
  return def.stages.find((s) => s.key === canonical) ?? null
}

export function openStages(def: CrmDefinition): CrmStage[] {
  return def.stages.filter((s) => s.kind === "open")
}

export function terminalStages(def: CrmDefinition): CrmStage[] {
  return def.stages.filter((s) => s.kind !== "open")
}

/**
 * Structural invariants, asserted in tests and at module load in development.
 *
 * These are the mistakes that are cheap to make while editing a definition and
 * expensive to notice afterwards: a duplicated key silently shadows a column,
 * a missing terminal stage breaks funnel maths, and a non-canonical key breaks
 * ranker training without raising anything.
 */
export function assertDefinition(def: CrmDefinition): void {
  const where = `CRM definition "${def.persona}"`

  if (!def.stages.length) throw new Error(`${where} has no stages.`)

  const seen = new Set<string>()
  for (const s of def.stages) {
    if (!isCanonicalStage(s.key)) {
      throw new Error(
        `${where} uses non-canonical stage "${s.key}". Add it to CANONICAL_STAGES ` +
          `and teach lib/matching/outcome-events.ts about it, or re-label an existing key.`,
      )
    }
    if (seen.has(s.key)) throw new Error(`${where} lists stage "${s.key}" twice.`)
    seen.add(s.key)
    if (!s.label.trim()) throw new Error(`${where} has an unlabelled stage "${s.key}".`)
  }

  if (!def.stages.some((s) => s.kind === "won")) {
    throw new Error(`${where} has no "won" stage — conversion metrics need one.`)
  }
  if (!def.stages.some((s) => s.kind === "lost")) {
    throw new Error(`${where} has no "lost" stage — without one, dead rows count as open.`)
  }
  if (def.stages[0]?.kind !== "open") {
    throw new Error(`${where} must start with an open stage; "${def.stages[0]?.key}" is terminal.`)
  }
  if (!def.sources.length) throw new Error(`${where} declares no sources.`)
}
