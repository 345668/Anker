"use client"

/**
 * useWebMcp — register an array of WebMCP tools for the lifetime of a
 * React component.
 *
 * Registration goes through an AbortController that's aborted on
 * unmount, so tools are automatically deregistered when the user
 * navigates away from the page. The hook is a no-op when WebMCP isn't
 * available, so callers don't need to conditionally render.
 *
 * Usage inside a "use client" component:
 *
 *   useWebMcp(
 *     () => [
 *       {
 *         name: "search_connections",
 *         description: "...",
 *         inputSchema: { type: "object", properties: { q: { type: "string" } } },
 *         execute: async ({ q }) => { setQuery(q); return `Filtered to \"${q}\"` },
 *       },
 *     ],
 *     [setQuery],
 *   )
 *
 * The factory function is re-run whenever any dep changes, so an updated
 * closure (referring to fresh state setters) is registered each time.
 * The previous registration is aborted first so we never leak tools.
 */
import { useEffect } from "react"
import { assertWithinBudgets, isWebMcpAvailable, isWebMcpEnabled, type WebMcpTool } from "./index"

export function useWebMcp(factory: () => WebMcpTool[], deps: React.DependencyList): void {
  useEffect(() => {
    if (!isWebMcpEnabled() || !isWebMcpAvailable()) return
    const modelContext = document.modelContext!
    const controller = new AbortController()
    const tools = factory()

    ;(async () => {
      for (const tool of tools) {
        try { assertWithinBudgets(tool) } catch (e) { console.warn(e) }
        try {
          await modelContext.registerTool(tool, { signal: controller.signal })
        } catch (e) {
          // Registration errors are non-fatal: the page still works, the
          // agent just won't see this particular tool. Log so we notice
          // duplicate-name or malformed-schema issues in dev.
          console.warn("[WebMCP] registerTool failed:", tool.name, e)
        }
      }
    })()

    return () => { controller.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}
