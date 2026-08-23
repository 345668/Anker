/**
 * Anker MCP server — exposes the platform tool belt (CRM, deal pipeline, investor
 * matching, 409A / loan / vesting engines via the generators, outreach, fund
 * performance, network intro paths, and document / spreadsheet / deck generation) over
 * the **Model Context Protocol** so any agent — DeepSeek Harness (`mcp-client`), Claude
 * Desktop, Cursor, or Anker's own loop — can use the platform as a plugin.
 *
 * Transport: **stateless MCP over Streamable HTTP** (JSON-RPC 2.0 POST). Running inside
 * the Next runtime means it reuses the DB, env, auth, and the existing tool
 * implementations (`lib/assistant/tools*.ts`) with zero duplication and deploys on Vercel.
 *
 * Auth:   `Authorization: Bearer <ANKER_MCP_TOKEN>` (required — no token env ⇒ server off).
 * Scope:  tools run as `ANKER_MCP_USER_ID`. `ANKER_MCP_TOOLS` = csv allowlist;
 *         `ANKER_MCP_READONLY=1` hides mutating tools.
 *
 * See docs/anker-mcp-server.md.
 */
import { NextRequest, NextResponse } from "next/server"
import { TOOLS, type ToolDef } from "@/lib/assistant/tools"
import { FO_TOOLS } from "@/lib/assistant/tools-fo"
import { PLATFORM_TOOLS } from "@/lib/assistant/tools-platform"
import { MODELING_TOOLS } from "@/lib/assistant/tools-modeling"
import { inputSchemaFor } from "@/lib/assistant/tool-schemas"
import { resolveMcpAuth, type McpPrincipal } from "@/lib/mcp/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ALL_TOOLS: Record<string, ToolDef> = { ...TOOLS, ...FO_TOOLS, ...PLATFORM_TOOLS, ...MODELING_TOOLS }
/** Tools that write to tenant data — hidden for read-only principals. */
const MUTATING = new Set(["crm_add_task", "crm_update_stage"])
const PROTOCOL_VERSION = "2025-06-18"
const SERVER_INFO = { name: "anker", version: "1.0.0" }

/** Tools visible to a principal — per-token allowlist + read-only filtering. */
function visibleTools(who: McpPrincipal): ToolDef[] {
  const allow = who.tools // per-token (or global) allowlist, or null for all
  return Object.values(ALL_TOOLS).filter((t) => {
    if (allow && !allow.includes(t.name)) return false
    if (who.readonly && MUTATING.has(t.name)) return false
    return true
  })
}

function toMcpTool(t: ToolDef) {
  return {
    name: t.name,
    description: `${t.description}\n\nInput shape: ${t.params}`,
    inputSchema: inputSchemaFor(t.name),
  }
}

function bearer(req: NextRequest): string {
  return (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
}

const rpcResult = (id: unknown, result: unknown) => NextResponse.json({ jsonrpc: "2.0", id, result })
const rpcError = (id: unknown, code: number, message: string, status = 200) =>
  NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } }, { status })

export async function GET() {
  return NextResponse.json({
    name: SERVER_INFO.name, protocol: "mcp", transport: "streamable-http",
    methods: ["initialize", "tools/list", "tools/call", "ping"],
    note: "POST JSON-RPC 2.0 with Authorization: Bearer <ANKER_MCP_TOKEN>.",
  })
}

export async function POST(req: NextRequest) {
  const who = await resolveMcpAuth(bearer(req))
  if (!who) {
    return rpcError(null, -32001, "Unauthorized — send Authorization: Bearer <token>", 401)
  }

  let msg: any
  try { msg = await req.json() } catch { return rpcError(null, -32700, "Parse error") }
  const { id, method, params } = msg ?? {}

  // JSON-RPC notifications carry no id (e.g. notifications/initialized) — ack, no body.
  if (id === undefined || id === null) return new NextResponse(null, { status: 202 })

  try {
    switch (method) {
      case "initialize":
        return rpcResult(id, {
          protocolVersion: params?.protocolVersion || PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions: "Anker platform tools. Call tools/list, then tools/call with the documented input shape.",
        })
      case "ping":
        return rpcResult(id, {})
      case "tools/list":
        return rpcResult(id, { tools: visibleTools(who).map(toMcpTool) })
      case "tools/call": {
        const name = params?.name as string
        const args = (params?.arguments ?? {}) as Record<string, unknown>
        const tool = visibleTools(who).find((t) => t.name === name)
        if (!tool) return rpcError(id, -32602, `Unknown or hidden tool "${name}"`)
        try {
          const res = await tool.run(args, { userId: who.userId })
          const content: Array<{ type: "text"; text: string }> = [{ type: "text", text: res.observation ?? "" }]
          if (res.artifact) content.push({ type: "text", text: `Generated file (${res.artifact.kind}): ${res.artifact.url}` })
          return rpcResult(id, { content, isError: false })
        } catch (e: any) {
          return rpcResult(id, { content: [{ type: "text", text: `Tool "${name}" failed: ${e?.message ?? "error"}` }], isError: true })
        }
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`)
    }
  } catch (e: any) {
    return rpcError(id, -32603, `Internal error: ${e?.message ?? "error"}`)
  }
}
