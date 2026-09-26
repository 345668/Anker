import { it, expect, describe } from "vitest"
import { stageToOutcome } from "@/lib/matching/outcome-events"
import { PIPELINE_STAGES } from "@/lib/matching/v2/types"
import {
  allDefinitions,
  assertDefinition,
  canonicalizeStage,
  definitionFor,
  founderCrm,
  initialStage,
  isCanonicalStage,
  isEnginePersona,
  lpCrm,
  openStages,
  stageByKey,
  terminalStages,
  vcCrm,
  type CrmDefinition,
} from "./index"

const clone = (def: CrmDefinition, stages: CrmDefinition["stages"]): CrmDefinition => ({ ...def, stages })

describe("every definition", () => {
  it("satisfies its structural invariants", () => {
    for (const def of allDefinitions()) expect(() => assertDefinition(def)).not.toThrow()
  })

  it("uses only canonical stage keys", () => {
    for (const def of allDefinitions())
      for (const s of def.stages) expect(isCanonicalStage(s.key), `${def.persona}/${s.key}`).toBe(true)
  })

  it("declares exactly one won stage and at least one lost", () => {
    for (const def of allDefinitions()) {
      expect(def.stages.filter((s) => s.kind === "won"), def.persona).toHaveLength(1)
      expect(terminalStages(def).length, def.persona).toBeGreaterThan(1)
    }
  })
})

// The reason stage keys are canonical rather than per-persona. If a definition
// re-keys its terminal stages, the learned ranker stops receiving training
// labels — and it stops silently, because an unrecognised stage maps to null.
describe("the ranker contract", () => {
  it("maps every won stage to the committed outcome", () => {
    for (const def of allDefinitions()) {
      const won = def.stages.find((s) => s.kind === "won")!
      expect(stageToOutcome(won.key), `${def.persona}/${won.key}`).toBe("committed")
    }
  })

  it("maps every lost stage to the declined outcome", () => {
    for (const def of allDefinitions())
      for (const s of def.stages.filter((x) => x.kind === "lost"))
        expect(stageToOutcome(s.key), `${def.persona}/${s.key}`).toBe("declined")
  })

  it("keeps non-terminal keys out of the terminal outcomes", () => {
    for (const def of allDefinitions())
      for (const s of openStages(def))
        expect(["committed", "declined"], `${def.persona}/${s.key}`).not.toContain(stageToOutcome(s.key))
  })

  it("draws keys the LP matching pipeline already knows", () => {
    const known = new Set<string>([...PIPELINE_STAGES, "queued", "term_sheet", "passed"])
    for (const def of allDefinitions())
      for (const s of def.stages) expect(known, `${def.persona}/${s.key}`).toContain(s.key)
  })
})

// founder-engine.ts excludes an investor from being re-surfaced when their row
// is at `queued`. Relabelling that stage is free; re-keying it would make the
// founder see duplicates of rows they already hold.
it("keeps queued as the founder entry stage", () => {
  expect(initialStage(founderCrm).key).toBe("queued")
  expect(initialStage(founderCrm).label).toBe("Researching")
})

it("gives the three personas different words for the same pipeline", () => {
  const at = (def: CrmDefinition, key: string) => stageByKey(def, key)?.label
  expect([at(founderCrm, "soft_circle"), at(vcCrm, "soft_circle"), at(lpCrm, "soft_circle")]).toEqual([
    undefined, // a founder has no soft-circle step
    "Soft circle",
    "IC",
  ])
  expect([founderCrm.person.one, vcCrm.person.one, lpCrm.person.one]).toEqual(["Investor", "Allocator", "GP"])
  expect(new Set([at(vcCrm, "queued"), at(lpCrm, "queued")])).toEqual(new Set(["Sourced", "Watchlist"]))
})

describe("canonicalizeStage", () => {
  it("passes canonical values through and resolves known aliases", () => {
    expect(canonicalizeStage("diligence")).toBe("diligence")
    expect(canonicalizeStage("in_diligence")).toBe("diligence")
    expect(canonicalizeStage("due_diligence")).toBe("diligence")
    expect(canonicalizeStage("engaged")).toBe("responded")
    expect(canonicalizeStage("closed_lost")).toBe("declined")
  })

  it("tolerates casing and surrounding whitespace", () => {
    expect(canonicalizeStage("  In_Diligence ")).toBe("diligence")
  })

  it("returns null for anything unrecognised rather than defaulting", () => {
    for (const v of ["", null, undefined, "pitched", "nurturing"]) expect(canonicalizeStage(v)).toBeNull()
  })

  it("resolves every legacy shortlist value", () => {
    // lib/crm/shortlist.ts has accepted these since May.
    for (const v of ["queued", "contacted", "responded", "meeting", "in_diligence", "committed", "passed"])
      expect(canonicalizeStage(v), v).not.toBeNull()
  })

  it("resolves every value the webmcp tool offers", () => {
    // components/webmcp/crm-tools.tsx disagrees with shortlist.ts on two keys.
    for (const v of ["queued", "contacted", "engaged", "meeting", "diligence", "committed", "passed"])
      expect(canonicalizeStage(v), v).not.toBeNull()
  })
})

describe("assertDefinition", () => {
  it("rejects a duplicated stage key", () => {
    const s = [...founderCrm.stages, founderCrm.stages[0]]
    expect(() => assertDefinition(clone(founderCrm, s))).toThrow(/twice/)
  })

  it("rejects a non-canonical key and says what to do", () => {
    const s = [{ key: "pitched" as any, label: "Pitched", kind: "open" as const }, ...founderCrm.stages.slice(1)]
    expect(() => assertDefinition(clone(founderCrm, s))).toThrow(/non-canonical stage "pitched"/)
  })

  it("rejects a pipeline with no lost stage", () => {
    expect(() => assertDefinition(clone(founderCrm, founderCrm.stages.filter((x) => x.kind !== "lost")))).toThrow(
      /no "lost" stage/,
    )
  })

  it("rejects a pipeline with no won stage", () => {
    expect(() => assertDefinition(clone(founderCrm, founderCrm.stages.filter((x) => x.kind !== "won")))).toThrow(
      /no "won" stage/,
    )
  })

  it("rejects a pipeline that opens on a terminal stage", () => {
    expect(() => assertDefinition(clone(founderCrm, [...founderCrm.stages].reverse()))).toThrow(/must start with an open/)
  })

  it("rejects an unlabelled stage and an empty pipeline", () => {
    expect(() => assertDefinition(clone(founderCrm, [{ key: "queued", label: "  ", kind: "open" }]))).toThrow(
      /unlabelled/,
    )
    expect(() => assertDefinition(clone(founderCrm, []))).toThrow(/no stages/)
  })
})

describe("the registry", () => {
  it("serves a definition for each persona", () => {
    for (const p of ["founder", "vc", "lp"] as const) expect(definitionFor(p).persona).toBe(p)
  })

  // LP stays off until doc 01 gives an LP a workspace — lib/crm/workspace.ts admits
  // only founder and VC, so there is no org_id to scope LP rows to.
  it("runs the engine for founder and vc, not lp", () => {
    expect(isEnginePersona("founder")).toBe(true)
    expect(isEnginePersona("vc")).toBe(true)
    expect(isEnginePersona("lp")).toBe(false)
    expect(isEnginePersona(null)).toBe(false)
    expect(isEnginePersona(undefined)).toBe(false)
  })

  it("throws for an unknown persona rather than rendering an empty pipeline", () => {
    expect(() => definitionFor("angel" as any)).toThrow(/No CRM definition/)
  })
})
