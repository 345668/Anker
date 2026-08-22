/**
 * Owner console — issue / list MCP access tokens (mcp_tokens).
 *
 * POST returns the raw bearer token ONCE (only its SHA-256 hash is stored, via
 * lib/mcp/auth.ts). GET lists non-secret metadata. Owner-gated. The MCP server
 * (app/api/mcp/route.ts) resolves these tokens to a scoped principal.
 */
import { NextRequest, NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { requireAdmin } from "@/lib/auth/require-admin"
import { isOwner } from "@/lib/auth/admin"
import { sql } from "@/lib/db"
import { hashMcpToken } from "@/lib/mcp/auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function gate(): Promise<{ userId: string; email: string | null } | NextResponse> {
  const g = await requireAdmin()
  if (g instanceof NextResponse) return g
  if (!isOwner(g.email)) return NextResponse.json({ error: "Owner only" }, { status: 403 })
  return { userId: g.id, email: g.email }
}

export async function GET() {
  const who = await gate()
  if (who instanceof NextResponse) return who
  try {
    const tokens = await sql`
      SELECT id, user_id, workspace_id, readonly, tools, label, created_at, last_used_at, revoked_at
      FROM mcp_tokens ORDER BY created_at DESC LIMIT 200`
    return NextResponse.json({ tokens })
  } catch {
    return NextResponse.json({
      tokens: [],
      warning: "mcp_tokens table not found — run scripts/migrations/2026-08-22-mcp-tokens.sql (pnpm migrate). Env tokens still work.",
    })
  }
}

export async function POST(req: NextRequest) {
  const who = await gate()
  if (who instanceof NextResponse) return who

  const body = await req.json().catch(() => ({} as any))
  const userId = String(body.userId || who.userId).trim()
  const workspaceId = body.workspaceId ? String(body.workspaceId).trim() : null
  const readonly = !!body.readonly
  const label = body.label ? String(body.label).slice(0, 120) : null
  const tools: string[] | null = Array.isArray(body.tools)
    ? body.tools.map(String)
    : typeof body.tools === "string" && body.tools.trim()
      ? body.tools.split(",").map((s: string) => s.trim()).filter(Boolean)
      : null
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 })

  const raw = randomBytes(24).toString("hex") // shown once, never stored
  try {
    const [row] = await sql`
      INSERT INTO mcp_tokens (token_hash, user_id, workspace_id, readonly, tools, label, created_by)
      VALUES (${hashMcpToken(raw)}, ${userId}, ${workspaceId}, ${readonly}, ${tools}::text[], ${label}, ${who.userId})
      RETURNING id, user_id, workspace_id, readonly, tools, label, created_at`
    return NextResponse.json({ token: raw, row })
  } catch (e: any) {
    return NextResponse.json(
      { error: `Could not create token: ${e?.message ?? "error"} — is the mcp_tokens migration applied?` },
      { status: 500 },
    )
  }
}
