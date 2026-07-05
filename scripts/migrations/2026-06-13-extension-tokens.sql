-- Personal bearer tokens minted from the Anker dashboard and pasted into
-- the Anker LinkedIn extension. Each token authenticates a single Chrome
-- profile / device. Tokens are stored hashed; the plaintext is shown to
-- the user exactly ONCE at mint time.
--
-- Auth model:
--   - User signs into Anker dashboard via Supabase
--   - User clicks "Mint extension token" -> POST /api/extension/tokens
--   - Plaintext returned in response body, hashed copy persisted here
--   - Extension stores plaintext in chrome.storage.local
--   - On every extension request, server hashes the Authorization header
--     and looks it up in this table
create table if not exists extension_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null,
  token_hash    text not null unique,
  prefix        text not null,                  -- first 12 chars of plaintext, for display
  label         text,                            -- user-supplied name ("Philippe MacBook")
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);

create index if not exists extension_tokens_user_active_idx
  on extension_tokens (user_id) where revoked_at is null;
create index if not exists extension_tokens_hash_active_idx
  on extension_tokens (token_hash) where revoked_at is null;
