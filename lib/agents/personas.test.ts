import { it, expect, describe, vi } from "vitest"
vi.mock("server-only", () => ({}))

import {
  PERSONA_AGENTS, agentForPersona, personaModelTask, personaModelTier,
  personaSystemBlock, personaSuggestions,
} from "./personas"
import { TASK_TIER, TASKS } from "@/lib/ai/model-router"

/**
 * Doc: docs/architecture/28-assistant-system-design.md phase 5.
 *
 * Acceptance: each persona's prompt and model tier are readable from one place,
 * and changing one persona's tier changes no other persona's behaviour.
 */
const PERSONAS = ["founder", "vc", "lp"] as const

describe("every persona is fully described in one place", () => {
  it("carries a label, role, tools, suggestions and a model task", () => {
    for (const p of PERSONAS) {
      const a = PERSONA_AGENTS[p]
      expect(a.label.trim()).not.toBe("")
      expect(a.role.trim().length).toBeGreaterThan(80)   // a real paragraph, not a stub
      expect(a.toolScope.length).toBeGreaterThan(0)
      expect(a.suggestions.length).toBeGreaterThan(0)
      expect(a.modelTask).toBeTruthy()
    }
  })

  it("declares a model task the router actually knows", () => {
    for (const p of PERSONAS) {
      expect(TASKS).toContain(personaModelTask(p))
      expect(TASK_TIER[personaModelTask(p)]).toBeTruthy()
    }
  })

  it("resolves a tier for each persona without reading the agent loop", () => {
    for (const p of PERSONAS) expect(typeof personaModelTier(p)).toBe("string")
  })
})

describe("the personas stay distinct", () => {
  it("gives each a different role and voice", () => {
    const roles = PERSONAS.map((p) => PERSONA_AGENTS[p].role)
    expect(new Set(roles).size).toBe(PERSONAS.length)
    expect(new Set(PERSONAS.map((p) => PERSONA_AGENTS[p].label)).size).toBe(PERSONAS.length)
  })

  it("scopes an LP away from the tools a GP needs", () => {
    // An LP oversees their own capital; they do not source deals or raise a fund.
    expect(PERSONA_AGENTS.lp.toolScope).not.toContain("deal")
    expect(PERSONA_AGENTS.lp.toolScope).not.toContain("crm")
    expect(PERSONA_AGENTS.vc.toolScope).toContain("deal")
  })

  // The acceptance criterion, as a test: tiers are per persona, not shared state.
  it("changing one persona's task leaves the others alone", () => {
    const before = Object.fromEntries(PERSONAS.map((p) => [p, personaModelTask(p)]))
    const original = PERSONA_AGENTS.lp.modelTask
    try {
      ;(PERSONA_AGENTS.lp as any).modelTask = "doc_summary"
      expect(personaModelTask("lp")).toBe("doc_summary")
      expect(personaModelTask("founder")).toBe(before.founder)
      expect(personaModelTask("vc")).toBe(before.vc)
    } finally {
      ;(PERSONA_AGENTS.lp as any).modelTask = original
    }
  })
})

describe("the system prompt", () => {
  it("names the active agent and states that navigation is not access", () => {
    const block = personaSystemBlock("founder")
    expect(block).toContain(PERSONA_AGENTS.founder.label)
    // The guard that stops the model inferring capability from the feature list.
    expect(block).toMatch(/not proof of data access/i)
    expect(block).toMatch(/Only the tool catalog grants capabilities/i)
  })

  it("differs per persona", () => {
    expect(personaSystemBlock("founder")).not.toBe(personaSystemBlock("lp"))
  })

  it("falls back to the fullest agent for an owner with no persona", () => {
    expect(agentForPersona(null).persona).toBe("vc")
    expect(personaSuggestions(null).length).toBeGreaterThan(0)
  })
})
