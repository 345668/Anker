import type { Persona } from "@/lib/org/active"
import { groupsForPersona } from "@/lib/nav/taxonomy"
import { TASK_TIER, type TaskTag } from "@/lib/ai/model-router"

/**
 * Persona agents — the AI Assistant / Anker AI adapt to who's driving. Each
 * persona (Founder, VC, LP) is a distinct agent: its own role, the Anker
 * features it's integrated with (derived from the shared nav taxonomy so it
 * never drifts from what the persona can actually reach), a tool scope, and
 * suggested tasks. One source of truth feeds the system prompt AND the UI
 * suggestion chips.
 */

export interface PersonaAgent {
  persona: Persona
  /** Product name shown in the UI. */
  label: string
  /** One-line description of what this agent helps with. */
  tagline: string
  /** Role paragraph injected into the agent system prompt. */
  role: string
  /** Tool-name prefixes/keywords this agent should prefer. Empty = all tools. */
  toolScope: string[]
  /** Suggested prompts surfaced in the chat empty-state. */
  suggestions: string[]
  /**
   * The task tag this persona's assistant runs under, which selects the model
   * tier via TASK_TIER (fast / balanced / deep / reason).
   *
   * All three sit on `deep_research` today — the tier the loop hardcoded before
   * this existed — so adding the field changed nobody's behaviour. It is here so
   * that changing one persona's tier is a one-line edit in one file, rather than
   * an archaeology exercise across the agent loop and the chat route.
   *
   * Tuning is a cost-and-quality decision, not something to infer from the role
   * text: an LP summarising a capital account may not need the deep tier, and a
   * GP checking figures may want the reasoning one. Both are worth measuring
   * before changing.
   */
  modelTask: TaskTag
}

export const PERSONA_AGENTS: Record<Persona, PersonaAgent> = {
  founder: {
    persona: "founder",
    modelTask: "deep_research",
    label: "Founder Copilot",
    tagline: "Raise your round — find investors, model the deal, share with confidence.",
    role:
      "You are the Founder Copilot: a fundraising and company-building agent for a startup founder. " +
      "Bias toward closing the round — investor discovery and matching, warm-intro paths, pitch and data-room prep, " +
      "cap-table and dilution modeling, option grants and 409A, and runway. Speak like an experienced operator; be concise and action-first.",
    toolScope: ["discover", "matchmake", "score", "enrich", "outreach", "crm", "web", "profile", "generate", "network", "research"],
    suggestions: [
      "Help me define investor criteria, then research candidates",
      "Review my saved cap table and its dilution assumptions",
      "Draft the section checklist for my data room",
      "Read my saved runway scenario and identify its key assumptions",
    ],
  },
  vc: {
    persona: "vc",
    modelTask: "deep_research",
    label: "Fund Copilot",
    tagline: "Run the fund — source deals, match LPs, and keep the back office tight.",
    role:
      "You are the Fund Copilot: an agent for a venture investor / GP. " +
      "Bias toward running the fund — deal sourcing and IC prep, thesis scoring and firm enrichment, LP matchmaking and fundraising, " +
      "portfolio monitoring and NAV, and back-office (capital calls, distributions, SPVs, KYC, fund tax, reporting). " +
      "Be rigorous with numbers and never invent figures — pull from the fund's real data via tools.",
    toolScope: ["score", "enrich", "matchmake", "deal", "pipeline", "portfolio", "fund", "lp", "outreach", "crm", "web", "research", "generate"],
    suggestions: [
      "Score these 20 firms against my thesis and rank them",
      "Match my fund to LPs likely to commit at my stage",
      "Summarize my deal pipeline and flag what needs an IC decision",
      "Draft a quarterly LP update from my fund performance",
    ],
  },
  lp: {
    persona: "lp",
    modelTask: "deep_research",
    label: "Investor Copilot",
    tagline: "Stay informed — your capital account, distributions, and portfolio at a glance.",
    role:
      "You are the Investor Copilot: an agent for a limited partner. " +
      "Bias toward clarity and oversight — summarizing capital accounts (committed / called / distributed / NAV), " +
      "explaining capital-call and distribution notices, surfacing documents (statements, K-1s), and tracking fund performance " +
      "(TVPI, DPI, MOIC, IRR). Explain plainly; never give tax or investment advice — point to the source documents.",
    toolScope: ["portfolio", "fund", "research", "web", "generate"],
    suggestions: [
      "Summarize my capital account across every fund I'm in",
      "What distributions did I receive this year, and from which funds?",
      "Explain the latest capital-call notice in plain English",
      "List the fund documents available to me and identify reporting gaps",
    ],
  },
}

/** Agent for a persona; owners (null) get the Fund Copilot (fullest toolset). */
export function agentForPersona(persona: Persona | null): PersonaAgent {
  return PERSONA_AGENTS[persona ?? "vc"]
}

/** System-prompt block describing the active agent + the Anker features it's
 *  integrated with (the persona's real platform destinations). */
export function personaSystemBlock(persona: Persona | null): string {
  const a = agentForPersona(persona)
  const features = groupsForPersona(persona)
    .map((g) => `${g.heading}: ${g.items.map((it) => it.label).join(", ")}`)
    .join("\n  ")
  return (
    `\n\nACTIVE AGENT — ${a.label} (${a.persona}).\n${a.role}\n\n` +
    `These are navigation destinations, not proof of data access. Only the tool catalog grants capabilities. When relevant, ` +
    `use the matching platform tool or point the user to that area:\n  ${features}\n`
  )
}

export function personaSuggestions(persona: Persona | null): string[] {
  return agentForPersona(persona).suggestions
}

/** The task tag a persona's assistant runs under. */
export function personaModelTask(persona: Persona | null): TaskTag {
  return agentForPersona(persona).modelTask
}

/** The model tier that task resolves to — for display and for admin tooling. */
export function personaModelTier(persona: Persona | null): string {
  return TASK_TIER[personaModelTask(persona)]
}
