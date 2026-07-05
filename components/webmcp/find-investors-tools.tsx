"use client"

/**
 * WebMCP tools for /dashboard/find-investors.
 *
 *   - search_investors(sector, stage, geo) : populates the search form and
 *                                            runs the match
 *   - add_to_shortlist(id, board)          : adds a result to a CRM board
 *
 * The matching engine lives at POST /api/matching/v2. We route through
 * the parent's setForm+run handlers so the UI reflects the change and
 * the human can see + edit before the model does anything expensive.
 */
import { useWebMcp } from "@/lib/webmcp/use-web-mcp"

interface StartupFormPatch {
  sector?: string
  stage?: string
  geo?: string
}

interface Props {
  onSearch: (patch: StartupFormPatch) => Promise<{ ok: boolean; matches?: number; msg?: string }>
  onAddToShortlist: (investorId: string, boardId: string) => Promise<{ ok: boolean; msg?: string }>
}

export function useFindInvestorsWebMcp(props: Props): void {
  const { onSearch, onAddToShortlist } = props
  useWebMcp(
    () => [
      {
        name: "search_investors",
        description: "Search Anker's investor database by sector, stage, and geography. Populates the search form and runs the match engine. Returns match count and highlights top scorers.",
        inputSchema: {
          type: "object",
          properties: {
            sector: { type: "string", description: "Sector — e.g. 'fintech', 'climate', 'AI infra'." },
            stage:  { type: "string", description: "Stage — e.g. 'pre-seed', 'seed', 'series A'." },
            geo:    { type: "string", description: "Investor geography focus — e.g. 'US', 'Europe', 'MENA'." },
          },
        },
        annotations: { readOnlyHint: true },
        execute: async (args: StartupFormPatch) => {
          const r = await onSearch(args || {})
          if (!r.ok) return `Search failed: ${r.msg || "unknown error"}.`
          const bits = Object.entries(args || {}).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(", ")
          return `Ran match with ${bits || "empty filters"}. ${r.matches ?? 0} match(es).`
        },
      },
      {
        name: "add_to_shortlist",
        description: "Add a matched investor to a CRM shortlist board. Use the investor's id from the results list and the target board id.",
        inputSchema: {
          type: "object",
          properties: {
            id:    { type: "string", description: "Investor id from the results list." },
            board: { type: "string", description: "CRM board id to add to." },
          },
          required: ["id", "board"],
        },
        execute: async ({ id, board }: { id: string; board: string }) => {
          const r = await onAddToShortlist(id, board)
          if (!r.ok) return `Add to shortlist failed: ${r.msg || "unknown error"}.`
          return `Added investor ${id} to board ${board}.`
        },
      },
    ],
    [onSearch, onAddToShortlist],
  )
}
/** Backward-compat component wrapper. Prefer useFindInvestorsWebMcp(). */
export function FindInvestorsWebMcpTools(props: Props): null {
  useFindInvestorsWebMcp(props)
  return null
}
