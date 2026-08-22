/**
 * MCP authentication — resolves a bearer token to a principal for the Anker MCP
 * server (app/api/mcp/route.ts). Supports multi-tenant, per-workspace tokens.
 *
 * Resolution order (first hit wins):
 *   1. DB table `mcp_tokens` (hashed lookup)   — production, revocable, per-workspace
 *   2. env `ANKER_MCP_TOKENS` (JSON map/array) — quick multi-tenant without a DB
 *   3. env `ANKER_MCP_TOKEN` + `ANKER_MCP_USER_ID` — legacy single token (back-compat)
 *
 * A token entry may carry its own `workspaceId`, `readonly`, and tool `allowlist`;
 * unset fields fall back to the global env defaults (`ANKER_MCP_READONLY`,
 * `ANKER_MCP_TOOLS`). Tokens are compared/stored by SHA-256 in the DB path; never log
 * the raw token.
 */
import { createHash, timingSafeEqual } from "node:crypto"

export interface McpPrincipal {
  userId: string
  workspaceId: string | null
  readonly: boolean
  /** Per-token tool allowlist; null = no per-token restriction. */
  tools: string[] | null
  label: string | null
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex")
}

function eq(a: string, b: string): boolean {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

function globalReadonly(): boolean {
  return process.env.ANKER_MCP_READONLY === "1" || process.env.ANKER_MCP_READONLY === "true"
}
function globalTools(): string[] | null {
  const csv = (process.env.ANKER_MCP_TOOLS || "").split(",").map((s) => s.trim()).filter(Boolean)
  return csv.length ? csv : null
}

/** Normalize a raw token-entry object into a principal, filling env defaults. */
function toPrincipal(e: any): McpPrincipal | null {
  const userId = String(e?.userId ?? e?.user_id ?? "").trim()
  if (!userId) return null
  const tools = Array.isArray(e?.tools) ? e.tools.map(String) : globalTools()
  const readonly = typeof e?.readonly === "boolean" ? e.readonly : globalReadonly()
  return {
    userId,
    workspaceId: (e?.workspaceId ?? e?.workspace_id ?? null) || null,
    readonly,
    tools,
    label: (e?.label ?? null) || null,
  }
}

/** 2. env ANKER_MCP_TOKENS — either { "<token>": {userId,…} } or [{ token, userId,… }]. */
function fromEnvMap(token: string): McpPrincipal | null {
  const raw = process.env.ANKER_MCP_TOKENS
  if (!raw) return null
  let data: any
  try { data = JSON.parse(raw) } catch { return null }
  if (Array.isArray(data)) {
    const hit = data.find((e) => typeof e?.token === "string" && eq(e.token, token))
    return hit ? toPrincipal(hit) : null
  }
  if (data && typeof data === "object") {
    // Constant-time-ish: iterate keys rather than direct index, to compare uniformly.
    for (const k of Object.keys(data)) if (eq(k, token)) return toPrincipal(data[k])
  }
  return null
}

/** 3. legacy single token. */
function fromEnvSingle(token: string): McpPrincipal | null {
  const expected = process.env.ANKER_MCP_TOKEN
  if (!expected || !eq(expected, token)) return null
  return {
    userId: process.env.ANKER_MCP_USER_ID || "",
    workspaceId: null,
    readonly: globalReadonly(),
    tools: globalTools(),
    label: "env-single",
  }
}

/** 1. DB table mcp_tokens (optional). Lookup by SHA-256 hash; graceful if absent. */
async function fromDb(token: string): Promise<McpPrincipal | null> {
  try {
    const { sql } = await import("@/lib/db")
    const rows = (await sql`
      SELECT user_id, workspace_id, readonly, tools, label
      FROM mcp_tokens
      WHERE token_hash = ${sha256(token)} AND revoked_at IS NULL
      LIMIT 1
    `) as Array<{ user_id: string; workspace_id: string | null; readonly: boolean | null; tools: string[] | null; label: string | null }>
    if (!rows.length) return null
    const r = rows[0]
    return {
      userId: r.user_id,
      workspaceId: r.workspace_id ?? null,
      readonly: typeof r.readonly === "boolean" ? r.readonly : globalReadonly(),
      tools: Array.isArray(r.tools) && r.tools.length ? r.tools : globalTools(),
      label: r.label ?? null,
    }
  } catch {
    // table missing / DB unavailable → fall through to env sources
    return null
  }
}

/** Resolve a bearer token to a principal, or null if unauthorized. */
export async function resolveMcpAuth(token: string | null | undefined): Promise<McpPrincipal | null> {
  const t = (token ?? "").trim()
  if (!t) return null
  return (await fromDb(t)) ?? fromEnvMap(t) ?? fromEnvSingle(t)
}

export { sha256 as hashMcpToken }
