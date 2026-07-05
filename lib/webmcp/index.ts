/**
 * WebMCP — feature detection + shared types.
 *
 * WebMCP (Web Model Context Protocol) is an origin-trial Chrome API that
 * lets a website register JS callable tools with the browser's built-in
 * AI agent (Gemini in Chrome + future entrants). The agent discovers
 * tools via `document.modelContext.getTools()` and invokes them via
 * `executeTool()`. Our React hook (see ./use-web-mcp) is a thin wrapper
 * on the imperative API that ties tool lifetimes to component mount.
 *
 * Docs: https://developer.chrome.com/docs/ai/on-chrome/webmcp
 *
 * The imperative API surface we depend on:
 *   document.modelContext.registerTool(tool, { signal })
 *   document.modelContext.getTools({ fromOrigins? })
 *   document.modelContext.executeTool(tool, argsJson)
 *
 * `document.modelContext` is undefined outside Chrome ≥ 149 with the
 * origin-trial token or the `chrome://flags/#enable-webmcp-testing` flag.
 * We hard-guard every call — no runtime error if WebMCP isn't there,
 * the page just works normally.
 */

// Ambient global (Chrome origin trial). We minimally type only what we
// actually call; the shape is otherwise pass-through JSON.
declare global {
  interface Document {
    modelContext?: {
      registerTool(tool: WebMcpTool, opts?: { signal?: AbortSignal; exposedTo?: string[] }): Promise<void>
      getTools(opts?: { fromOrigins?: string[] }): Promise<Array<{ name: string; description: string; inputSchema: string; origin: string }>>
      executeTool(tool: unknown, argsJson: string, opts?: { signal?: AbortSignal }): Promise<unknown>
      addEventListener(event: "toolchange", handler: () => void): void
      removeEventListener(event: "toolchange", handler: () => void): void
    }
  }
}

export interface WebMcpAnnotations {
  /** Tool doesn't change state — the agent may call it freely without prompting the user. */
  readOnlyHint?: boolean
  /** Tool may return user-generated / externally-sourced content the agent should distrust. */
  untrustedContentHint?: boolean
}

export interface WebMcpTool {
  /** ≤30 chars, snake_case, verb-first. Matches the store guidance. */
  name: string
  /** ≤500 chars — describes the effect and when to use it. */
  description: string
  /** JSON Schema draft-2020-12 subset — properties + required + enum. */
  inputSchema: Record<string, any>
  /** Async executor. Return a short string / small object the agent can consume. */
  execute: (args: any) => Promise<unknown> | unknown
  annotations?: WebMcpAnnotations
}

/** True when the browser exposes the WebMCP API. Safe to call at render-time
 *  or in useEffect — no global mutation. Server-side always returns false. */
export function isWebMcpAvailable(): boolean {
  if (typeof document === "undefined") return false
  return typeof (document as any).modelContext?.registerTool === "function"
}

/** Character budgets from
 *  https://developer.chrome.com/docs/ai/on-chrome/webmcp/security#character-budgets.
 *  Enforced by `assertWithinBudgets()` in dev to catch drift early. */
export const BUDGETS = {
  toolName: 30,
  paramName: 30,
  toolDescription: 500,
  paramDescription: 150,
  toolOutput: 1500,
} as const

/** Sanity-check a tool against the WebMCP character budgets. Throws in
 *  development, no-op in prod so a slightly over-budget description
 *  doesn't 500 the page. */
export function assertWithinBudgets(t: WebMcpTool): void {
  if (process.env.NODE_ENV !== "development") return
  const bail = (msg: string) => { throw new Error(`[WebMCP] ${t.name}: ${msg}`) }
  if (t.name.length > BUDGETS.toolName) bail(`name > ${BUDGETS.toolName}`)
  if (t.description.length > BUDGETS.toolDescription) bail(`description > ${BUDGETS.toolDescription}`)
  const props = (t.inputSchema.properties ?? {}) as Record<string, any>
  for (const [k, v] of Object.entries(props)) {
    if (k.length > BUDGETS.paramName) bail(`param "${k}" > ${BUDGETS.paramName}`)
    const d = String(v?.description ?? "")
    if (d.length > BUDGETS.paramDescription) bail(`param "${k}" desc > ${BUDGETS.paramDescription}`)
  }
}

/** Common feature-flag guard so pages can bail early when WebMCP is
 *  disabled at build time (e.g. a preview deploy that doesn't want to
 *  register tools). Set NEXT_PUBLIC_WEBMCP=0 in env to force-off. */
export function isWebMcpEnabled(): boolean {
  const flag = process.env.NEXT_PUBLIC_WEBMCP
  if (flag === "0" || flag === "false") return false
  return true
}
