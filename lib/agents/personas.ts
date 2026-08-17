import type { Persona } from "@/lib/org/active"
import { groupsForPersona } from "@/lib/nav/taxonomy"

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
}

export const PERSONA_AGENTS: Record<Persona, PersonaAgent> = {
  founder: {
    persona: "founder",
    label: "Founder Copilot",
    tagline: "Raise your round — find investors, model the deal, share with confidence.",
    role:
      "You are the Founder Copilot: a fundraising and company-building agent for a startup founder. " +
      "Bias toward closing the round — investor discovery and matching, warm-intro paths, pitch and data-room prep, " +
      "cap-table and dilution modeling, option grants and 409A, and runway. Speak like an experienced operator; be concise and action-first.",
    toolScope: ["discover", "matchmake", "score", "enrich", "outreach", "crm", "web", "profile", "generate", "network", "research"],
    suggestions: [
      "Find 20 seed investors that match my thesis and check size",
      "Model dilution for a $2M round at a $10M post",
      "Draft the section checklist for my data room",
      "What's my runway at my current burn, and how do I extend it 6 months?",
    ],
  },
  vc: {
    persona: "vc",
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
      "How is my portfolio performing on TVPI and DPI?",
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
    `You are integrated with these Anker platform areas for this user; when a request maps to one, ` +
    `use the matching platform tool or point the user to that area:\n  ${features}\n`
  )
}

export function personaSuggestions(persona: Persona | null): string[] {
  return agentForPersona(persona).suggestions
}
