# Anker MCP Server

Exposes the Anker platform tool belt over the **Model Context Protocol** so any agent —
[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`mcp-client`), Claude
Desktop, Cursor, or Anker's own assistant loop — can use the platform as a plugin.

- **Endpoint:** `POST /api/mcp` (stateless MCP over Streamable HTTP, JSON-RPC 2.0)
- **Code:** [`app/api/mcp/route.ts`](../app/api/mcp/route.ts) — runs inside the Next runtime,
  so it reuses the DB, env, and the existing tool implementations (`lib/assistant/tools*.ts`)
  with zero duplication. Deploys on Vercel like any route.
- **Tools:** all 29 belt tools (CRM, deal pipeline, investor matching + scoring, enrichment,
  outreach drafting, fund performance, network intro paths, web search/crawl, image/OCR,
  and document / spreadsheet / pitch-deck generation).

## Authentication (multi-tenant)

Every request needs `Authorization: Bearer <token>`. Tokens resolve to a **principal**
(`{ userId, workspaceId?, readonly, tools? }`) via [`lib/mcp/auth.ts`](../lib/mcp/auth.ts),
first hit wins:

1. **DB table `mcp_tokens`** (production) — hashed (SHA-256), revocable, per-workspace,
   per-token `readonly` + tool allowlist. Migration:
   [`scripts/migrations/2026-08-22-mcp-tokens.sql`](../scripts/migrations/2026-08-22-mcp-tokens.sql)
   (`pnpm migrate`). The auth path degrades gracefully if the table is absent.
2. **env `ANKER_MCP_TOKENS`** (quick multi-tenant, no DB) — a JSON map/array of tokens.
3. **env `ANKER_MCP_TOKEN` + `ANKER_MCP_USER_ID`** (legacy single token).

Per-token fields fall back to the global defaults `ANKER_MCP_READONLY` (`1` hides
mutating tools — `crm_add_task`, `crm_update_stage`) and `ANKER_MCP_TOOLS` (CSV allowlist).

```bash
# .env.local — option A: multi-tenant token map (no DB)
ANKER_MCP_TOKENS={"<tokenA>":{"userId":"usr_x","workspaceId":"ws1","label":"dsh-bot"},"<tokenB>":{"userId":"usr_y","readonly":true,"tools":["query_investors","score_investors"]}}

# option B: single legacy token
ANKER_MCP_TOKEN=<a long random secret>
ANKER_MCP_USER_ID=usr_xxx
```

For the DB path, issue tokens by storing `sha256(rawToken)` (show the raw token once);
`readonly` and `tools[]` scope each token independently. See the migration for the exact
INSERT/revoke SQL.

## Protocol

Standard MCP methods over JSON-RPC 2.0: `initialize`, `tools/list`, `tools/call`, `ping`;
notifications (e.g. `notifications/initialized`) are acked with `202`. Each tool now
publishes a **tight JSON Schema** ([`lib/assistant/tool-schemas.ts`](../lib/assistant/tool-schemas.ts)) —
typed properties, `required`, enums, and `additionalProperties:false` — so clients
validate and autocomplete args (e.g. `score_investors` → `required:["thesis"]`;
`query_investors` takes `{ keyword?, type?, limit? }`). The human hint also ships in each
tool's `description`.

```bash
# initialize
curl -sX POST https://<host>/api/mcp \
  -H "Authorization: Bearer $ANKER_MCP_TOKEN" -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'

# list tools
curl -sX POST https://<host>/api/mcp -H "Authorization: Bearer $ANKER_MCP_TOKEN" \
  -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# call a tool
curl -sX POST https://<host>/api/mcp -H "Authorization: Bearer $ANKER_MCP_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call",
       "params":{"name":"query_investors","arguments":{"keyword":"fintech","limit":5}}}'
```

## Connecting agents

**DeepSeek Harness** — its `mcp-client` registers external MCP-server tools on `ctx.tools`.
Point it at the HTTP endpoint with the auth header (per dsh's mcp-client config), or bridge
via `mcp-remote` (below) for a stdio mount.

**Claude Desktop / Cursor** (stdio clients) — bridge the HTTP endpoint to stdio with the
community `mcp-remote` shim:

```json
{
  "mcpServers": {
    "anker": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://<host>/api/mcp",
               "--header", "Authorization: Bearer <ANKER_MCP_TOKEN>"]
    }
  }
}
```

Clients that support native HTTP MCP connectors can use the URL + bearer header directly.

## Security notes
- The token is a bearer secret — treat it like an API key; rotate it by changing the env.
- `ANKER_MCP_READONLY` / `ANKER_MCP_TOOLS` narrow the surface for untrusted agents.
- **Per-workspace tokens** (a `token → userId/workspace` table instead of a single env
  user) are the next hardening step for multi-tenant use.
- Verified end-to-end locally: 401 without token, `initialize`, `tools/list` (29 tools),
  `tools/call` execution + artifact links, and JSON-RPC error codes.
