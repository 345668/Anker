/**
 * Agent presets — persona → { tools, persona prose, skills }.
 *
 * Mirrors DeepSeek Harness's `agent-presets` (a preset composes a toolset + persona +
 * skills for a named agent). Here a preset scopes the flat tool belt to a
 * persona-relevant subset — a shared core plus persona specialists (the MoE
 * shared-vs-routed-experts idea). The persona prose still comes from
 * `personaSystemBlock` (lib/agents/personas.ts); the persona SKILL rows in
 * skills/personas/*.md document each preset. See docs/anker-plugins-and-model-skills.md.
 */
import type { Persona } from "@/lib/org/active"

/** Shared core — every persona can research, query, and produce documents. */
const SHARED = [
  "web_search", "web_crawl", "query_investors", "generate_spreadsheet",
  "generate_document", "analyze_image", "ocr_image", "translate_text",
]

export interface AgentPreset {
  id: string
  persona: Exclude<Persona, null>
  /** Persona row (skills/personas/<id>.md) — the identity prose. */
  personaSkill: string
  /** Tool-name allowlist for this persona (shared core + specialists). */
  tools: string[]
  /** Model role-skills (skills/models/*.md) this preset leans on. */
  skills: string[]
}

export const PRESETS: Record<Exclude<Persona, null>, AgentPreset> = {
  founder: {
    id: "founder-copilot",
    persona: "founder",
    personaSkill: "personas/founder-copilot.md",
    tools: [
      ...SHARED,
      "build_investor_profile", "score_investors", "matchmake_lps", "network_intro_paths",
      "draft_outreach_batch", "outreach_inbox",
      "crm_overview", "crm_search", "crm_update_stage", "crm_add_task", "deal_pipeline",
      "create_pitch_deck", "improve_pitch_deck", "generate_image",
    ],
    skills: ["investor-score", "campaign-draft", "deck-critique", "agent-plan", "agent-verify"],
  },
  vc: {
    id: "fund-copilot",
    persona: "vc",
    personaSkill: "personas/fund-copilot.md",
    tools: [
      ...SHARED,
      "build_investor_profile", "score_investors", "enrich_firms", "matchmake_lps",
      "deal_pipeline", "fund_performance", "network_intro_paths",
      "draft_outreach_batch", "outreach_inbox",
      "crm_overview", "crm_search", "crm_update_stage", "crm_add_task",
      "create_pitch_deck", "generate_image",
      // GP back-office XLSX pipelines
      "enrich_db_from_xlsx", "db_gap_analysis", "generate_event_outreach_drafts",
      "apply_template_to_outreach_drafts", "enrich_xlsx_with_llm",
    ],
    skills: ["investor-score", "fund-critique", "campaign-draft", "agent-plan", "agent-verify", "deep-research"],
  },
  lp: {
    id: "investor-copilot",
    persona: "lp",
    personaSkill: "personas/investor-copilot.md",
    // LPs monitor capital — read-oriented; no CRM/outreach/mutating tools.
    tools: [...SHARED, "fund_performance", "build_investor_profile"],
    skills: ["deep-research", "agent-verify"],
  },
}

export function presetFor(persona: Persona | undefined): AgentPreset | null {
  if (!persona) return null // owner / base assistant → no tool scoping (all tools)
  return PRESETS[persona] ?? null
}

/** Tool-name allowlist for a persona, or null for "all tools" (owner/base). */
export function toolAllowlistFor(persona: Persona | undefined): Set<string> | null {
  const p = presetFor(persona)
  return p ? new Set(p.tools) : null
}
