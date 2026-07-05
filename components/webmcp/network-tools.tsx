"use client"

/**
 * WebMCP tools for /dashboard/network.
 *
 * These give a browser-native agent (Gemini in Chrome, etc.) three ways
 * to drive the relationship graph without simulating clicks:
 *
 *   - search_connections(q, firm, degree)  — filter the constellation
 *   - filter_graph(warm_only, degrees)      — apply structural filters
 *   - open_intro_path(profile_url)          — pop the intro-paths drawer
 *
 * Every tool mutates state via setters passed in from the parent, so no
 * DOM scraping and no ref juggling. The component itself renders
 * nothing.
 */
import { useWebMcp } from "@/lib/webmcp/use-web-mcp"

interface Props {
  onSearch: (q: string) => void
  onFilter: (opts: { warmOnly?: boolean; degrees?: number[] }) => void
  onOpenIntro: (profileUrl: string) => Promise<{ ok: boolean; paths?: number; hint?: string }>
}

export function useNetworkWebMcp(props: Props): void {
  const { onSearch, onFilter, onOpenIntro } = props
  useWebMcp(
    () => [
      {
        name: "search_connections",
        description: "Filter your LinkedIn Network constellation by text, firm, or connection degree. Applies all provided filters together. Returns a short summary of how many nodes now match.",
        inputSchema: {
          type: "object",
          properties: {
            q:      { type: "string", description: "Free-text search across name, headline, firm, and location." },
            firm:   { type: "string", description: "Restrict to one firm name exactly. Empty means all firms." },
            degree: { type: "integer", enum: [1, 2, 3], description: "Only include connections at this network degree." },
          },
        },
        annotations: { readOnlyHint: true },
        execute: async ({ q, firm, degree }: { q?: string; firm?: string; degree?: number }) => {
          const parts: string[] = []
          if (typeof q === "string" && q.length) { onSearch(q); parts.push(`text=${q}`) }
          if (typeof firm === "string" && firm.length) parts.push(`firm=${firm}`)
          const degrees = typeof degree === "number" ? [degree] : undefined
          if (degrees || typeof firm === "string") onFilter({ degrees })
          return parts.length ? `Filtering by ${parts.join(", ")}. See the constellation for matches.` : "Cleared filters."
        },
      },
      {
        name: "filter_graph",
        description: "Toggle structural filters on the Network graph. Use warm_only=true to hide people who are not in your CRM. Use degrees to show only specific degree rings.",
        inputSchema: {
          type: "object",
          properties: {
            warm_only: { type: "boolean", description: "true to show only CRM-matched (warm) nodes." },
            degrees:   { type: "array", items: { type: "integer", enum: [1, 2, 3] }, description: "Subset of 1st/2nd/3rd degree rings to show. Omit to show all." },
          },
        },
        annotations: { readOnlyHint: true },
        execute: async ({ warm_only, degrees }: { warm_only?: boolean; degrees?: number[] }) => {
          onFilter({ warmOnly: warm_only, degrees })
          const bits = [
            typeof warm_only === "boolean" ? `warm_only=${warm_only}` : null,
            Array.isArray(degrees) && degrees.length ? `degrees=${degrees.join("+")}` : null,
          ].filter(Boolean)
          return bits.length ? `Applied ${bits.join(", ")}.` : "No filters changed."
        },
      },
      {
        name: "open_intro_path",
        description: "Open the details drawer for a LinkedIn profile URL and show 'who can introduce me' warm-intro paths. Use for 2nd or 3rd degree contacts. The profile_url must be a linkedin.com/in/... URL.",
        inputSchema: {
          type: "object",
          properties: {
            profile_url: { type: "string", description: "Full linkedin.com/in/<slug> URL of the person to show intro paths for." },
          },
          required: ["profile_url"],
        },
        execute: async ({ profile_url }: { profile_url: string }) => {
          if (typeof profile_url !== "string" || !/linkedin\.com\/in\//i.test(profile_url)) {
            return "profile_url must be a linkedin.com/in/... URL."
          }
          const r = await onOpenIntro(profile_url)
          if (!r.ok) return r.hint || "Could not open intro paths."
          return typeof r.paths === "number" ? `Opened. Found ${r.paths} intro path(s).` : "Opened."
        },
      },
    ],
    [onSearch, onFilter, onOpenIntro],
  )
}
/** Backward-compat component wrapper. Prefer useNetworkWebMcp(). */
export function NetworkWebMcpTools(props: Props): null {
  useNetworkWebMcp(props)
  return null
}
