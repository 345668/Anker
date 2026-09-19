import "server-only"

/**
 * The Observe tier — the only tools a live call may reach.
 *
 * Phase 1 of docs/call-agent-bridge-design-2026-09-19.md. During a call the
 * user is talking, so nothing here may write: being wrong has to cost a wasted
 * lookup and nothing else. The agent's view of the conversation is
 * speech-to-text output, which mishears names, numbers and negations, and a
 * write made on a mishearing is one nobody watched happen.
 *
 * FAIL CLOSED. This is an allowlist, not a denylist. A tool that is not named
 * here is unreachable from a call, including every tool added later — which is
 * the behaviour we want from a list whose job is to be conservative.
 *
 * Every entry was checked to contain no INSERT / UPDATE / DELETE, and
 * agent-observe.test.ts re-checks that on every run so the guarantee survives
 * someone adding a write to an existing tool.
 */
export const OBSERVE_TOOLS = [
  // Workspace context — who this is, where the deal stands, who we know.
  "crm_overview",
  "crm_search",
  "deal_pipeline",
  "network_intro_paths",
  "outreach_inbox",
  "fund_performance",
  // Investor lookup against our own database.
  "query_investors",
  // Outward research. Slowest thing here, and the only one that leaves the
  // building; kept because "what happened to this fund recently" is the
  // question a live call most often needs.
  "web_search",
] as const

export type ObserveTool = (typeof OBSERVE_TOOLS)[number]

export const isObserveTool = (name: string): name is ObserveTool =>
  (OBSERVE_TOOLS as readonly string[]).includes(name)

/**
 * Deliberately excluded, with the reason, so the next person does not have to
 * re-derive it. Order matches the tiers in the design doc.
 */
export const EXCLUDED_REASONS: Record<string, string> = {
  crm_update_stage: "Propose tier — writes a stage other people make decisions on.",
  crm_add_task: "Propose tier — writes, even if the write is cheap to undo.",
  send_outreach: "Never tier — sends real email; the approval gate owns this.",
  outreach_sequence: "Never tier — schedules real sends.",
  followup_sweep: "Never tier — sends in bulk.",
  draft_capital_call: "Never tier — an LP-facing financial notice.",
  build_investor_profile: "Writes profile rows, and is far too slow for a live call.",
  export_investors: "Produces a file; nothing to show mid-call.",
  generate_spreadsheet: "Produces a file; nothing to show mid-call.",
  generate_document: "Produces a file; nothing to show mid-call.",
  render_document_pro: "Produces a file; nothing to show mid-call.",
  create_pitch_deck: "Minutes of work; belongs nowhere near a live call.",
  web_crawl: "Unbounded latency — a slow site would blow the response budget.",
}

/** How long a live turn may take before the answer is worthless to the user. */
export const OBSERVE_TIMEOUT_MS = 20_000

/** The agent loop is bounded hard: a live turn cannot afford to wander. */
export const OBSERVE_MAX_STEPS = 4

/** Transcript window accepted per turn. Enough for context, not a transcript upload. */
export const OBSERVE_WINDOW_CHARS = 6_000

/** Ceiling per call, so a long conversation cannot become an unbounded bill. */
export const OBSERVE_MAX_TURNS_PER_CALL = 60
