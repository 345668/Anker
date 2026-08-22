-- Per-workspace MCP access tokens for the Anker MCP server (app/api/mcp/route.ts).
-- Each row is one bearer token, stored as a SHA-256 hash (never plaintext), that maps
-- to the user/workspace the tools run as, plus optional read-only and tool-allowlist
-- scoping. Resolved by lib/mcp/auth.ts (which falls back to env tokens if this table is
-- absent, so applying this migration is optional but recommended for multi-tenant use).
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id            text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  -- SHA-256 hex of the raw bearer token. The raw token is shown once at creation and
  -- never stored. Look up with encode(digest(:token,'sha256'),'hex').
  token_hash    text NOT NULL UNIQUE,
  user_id       text NOT NULL,            -- the Anker user the tools act as
  workspace_id  text,                     -- optional workspace scoping
  readonly      boolean NOT NULL DEFAULT false,
  tools         text[],                   -- optional per-token tool allowlist (null = all)
  label         text,                     -- human label (e.g. "dsh — research bot")
  created_by    text,                     -- user id who issued it
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz               -- non-null = revoked (lookup filters these out)
);

CREATE INDEX IF NOT EXISTS mcp_tokens_user_idx      ON mcp_tokens (user_id);
CREATE INDEX IF NOT EXISTS mcp_tokens_workspace_idx ON mcp_tokens (workspace_id);

-- Issue a token (run in your own tooling, not here):
--   token := encode(gen_random_bytes(24),'hex');  -- show once
--   INSERT INTO mcp_tokens (token_hash, user_id, workspace_id, readonly, tools, label)
--   VALUES (encode(digest(token,'sha256'),'hex'), :user_id, :workspace_id, false,
--           ARRAY['query_investors','score_investors','matchmake_lps'], 'label');
-- Revoke:  UPDATE mcp_tokens SET revoked_at = now() WHERE id = :id;
