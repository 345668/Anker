# Anker — local runbook

Two ways to run, swap with one env var.

## Mode 1 — PGlite (zero install, default)

```bash
pnpm install
node scripts/load-local-db.mjs uploads/investment_firms-5.xlsx uploads/investors.xlsx
pnpm build && pnpm start
# → http://localhost:3000
```

`.env.local`:
```
LOCAL_DB=true
SECRET_KEY=<32 hex chars — `openssl rand -hex 32`>
```

PGlite (Electric SQL's WASM Postgres) runs in-process. Data persists to `.local-db/`.
Settings page works. API keys encrypted at rest with AES-256-GCM.

## Mode 2 — Real Postgres via Docker

```bash
# 1. Bring up Postgres
docker compose up -d postgres

# 2. Load the xlsx data into it (one-time)
docker compose --profile tools run --rm loader

# 3. Point the app at Postgres
echo 'LOCAL_DB=false' >> .env.local
echo 'DATABASE_URL=postgresql://anker:anker@localhost:5432/anker' >> .env.local

# 4. Either run the app on host or in-compose
pnpm start                                # host
docker compose --profile full up app      # containerised
```

Postgres data persists in the named volume `anker-pgdata`. To wipe:
```bash
docker compose down -v
```

## Encryption

`SECRET_KEY` enables AES-256-GCM encryption of API keys (Anthropic, OpenAI, Mistral,
SendGrid) at rest. Set it in `.env.local`. Without it, keys are stored as plaintext
(local-dev only — the app warns on startup).

Rotation: change `SECRET_KEY`, settings will fail to decrypt with the old ciphertext.
A migration script can re-encrypt — see `scripts/test-settings.mjs` for the pattern.

## Settings page

Lives at `/dashboard/settings`. Saves all of the following to `user_settings` (one row
per `user_id`):

- API keys: Anthropic, OpenAI, Mistral, SendGrid (encrypted)
- Sender identity: email + name
- Founder profile: company name, website, industry, stage, description, target raise, ARR
- VC profile: firm name, type, AUM, thesis, preferred stages/sectors, check size range
- Notification preferences: email, matches, deals, documents, weekly digest

Reads decrypt API keys server-side; values are never sent to the client raw.

## Tests

```bash
node scripts/test-matching-v2.mjs   # scoring boundary cases
node scripts/test-local-db.mjs      # PGlite read sanity
node scripts/test-settings.mjs      # encryption round-trip
```

## Switching DBs without losing data

PGlite → Docker Postgres:
```bash
# Dump from PGlite (it's real Postgres on disk)
docker compose up -d postgres
docker compose --profile tools run --rm loader   # re-loads from xlsx
# user_settings can be migrated by exporting the row from .local-db/
# and inserting into Postgres — schemas are identical.
```
