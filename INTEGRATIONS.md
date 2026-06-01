# Anker — open-source integrations

> **Heads-up:** the email-check tool also calls **Hunter.io** when
> `HUNTER_API_KEY` is set. Hunter is closed-source / paid, but the
> client wrapper degrades gracefully (format + DNS-MX fallback) when
> the key is missing. See § "Email check" below.



This pass adds six pieces of open-source plumbing on top of Anker:

1. **Twenty CRM** (twentyhq/twenty) — self-hosted CRM with one-way push + pull-back stage sync from Anker.
2. **@mozilla/readability** + **crawlee** — quality bump on every page crawled by enrichment / deep-research / profile-builder.
3. **pgvector** — semantic search over `investment_firms` / `investors` / `crm_entries`.
4. **SearXNG** — meta-search engine that replaces the URL-guessing heuristic in deep-research.
5. **Marker** — Python sidecar that converts image-heavy decks to clean Markdown.
6. **Vercel AI SDK** — typed structured-output bridge (`lib/ai/sdk-bridge.ts`) sitting next to the existing `provider.ts`.

## One-time setup

```bash
cd Anker
pnpm install                                                  # picks up the new deps
psql "$DATABASE_URL" -f scripts/migrations/2026-05-08-pgvector.sql
ollama pull nomic-embed-text                                  # default embed model (768-d)
node scripts/backfill-embeddings.mjs                          # backfill all 3 tables

# Bring up the integration sidecars (Twenty, SearXNG, Marker)
docker compose -f docker-compose.yml -f docker-compose.integrations.yml up -d \
  postgres twenty-db twenty-redis twenty searxng marker
```

Add to `.env.local`:

```
TWENTY_BASE_URL=http://localhost:3010
TWENTY_API_KEY=...                # create in Twenty: Settings → Developers → API & Webhooks
TWENTY_APP_SECRET=$(openssl rand -base64 32)

SEARXNG_URL=http://localhost:8080
SEARXNG_SECRET=$(openssl rand -hex 32)

MARKER_URL=http://localhost:8001

OLLAMA_EMBED_MODEL=nomic-embed-text
OLLAMA_EMBED_DIM=768
```

When any of these is unset, the corresponding feature degrades gracefully — Anker keeps working without it.

## 1. Twenty CRM (twentyhq/twenty)

**What it does in Anker:** every CRM entry is mirrored into Twenty as Company + Person + Opportunity. You can also pull Opportunity stages back into Anker so the kanban there reflects edits made in Twenty's UI.

**Code:**
- `lib/twenty/client.ts` — GraphQL client wrapping Twenty's Companies / People / Opportunities mutations + queries.
- `lib/twenty/sync.ts` — `pushCrmEntry(id)`, `pushAll()`, `pullCrmStages()`. Forward-only stage progression to match `lib/agents/crm-sync.ts`.
- `app/api/twenty/sync` — POST endpoint:
  - `{ crmEntryId }` — owner OR admin can push one
  - `{ all: true, limit, userId }` — admin push many
  - `{ pull: true, limit, userId }` — admin pull stages back

**Stage mapping:**

| Anker `crm_entries.stage` | ↔ Twenty `Opportunity.stage` |
| ------------------------- | ---------------------------- |
| queued                    | NEW                          |
| contacted                 | SCREENING                    |
| responded / meeting       | MEETING                      |
| in_diligence              | PROPOSAL                     |
| committed                 | CUSTOMER                     |
| passed                    | CLOSED_LOST                  |

**Custom fields:** the sync tags each Twenty record with `ankerFirmId` / `ankerInvestorId` / `ankerCrmEntryId` so re-pushes upsert instead of duplicating. Add these as text fields in Twenty's Settings → Data Model. The wrapper swallows errors when the columns don't exist yet (you can configure later).

## 2. Readability + Crawlee

**What it does:** the regex-based text extractor in `lib/admin/web-crawler.ts` is replaced (with fallback) by Mozilla's Readability. Editorial sites — VC blogs, About pages, portfolio detail pages — produce dramatically cleaner text downstream. The fallback regex pipeline is preserved for non-article pages.

**Code:** `lib/admin/web-crawler.ts:extractText()` lazy-loads `@mozilla/readability` + `jsdom`; if Readability declines (no body / too short), the legacy regex stripper runs.

**No caller changes** — every existing consumer (enrichment, deep-research, profile-builder) automatically benefits.

> Crawlee is staged as a future drop-in replacement for the whole `crawlSite()` function — it brings request queues, proxy rotation, and stronger Playwright support. Not wired yet; the dep is added so we can swap when needed.

## 3. pgvector

**What it does:** `embedding vector(768)` columns on `investment_firms`, `investors`, and `crm_entries` with HNSW indexes. Embeddings are generated locally via Ollama's `nomic-embed-text` model.

**Migration:** `scripts/migrations/2026-05-08-pgvector.sql`
**Helper:** `lib/ai/embeddings.ts` — `embed(text)`, `embedBatch(texts)`, plus the canonical text-builders for each table.
**Search:** `lib/ai/semantic-search.ts`:
- `similarFirms(query, limit)` — find firms matching a text description
- `similarInvestors(query, limit)`
- `similarToInvestor(investorId, limit)` — "investors like X"
- `nearDuplicateFirms(firmId, threshold=0.92)` — dedup candidates

**Backfill:**
```bash
node scripts/backfill-embeddings.mjs                # all 3 tables
node scripts/backfill-embeddings.mjs firms          # one
node scripts/backfill-embeddings.mjs --batch=100 --force
```

**Switching embedding model:** the schema is sized for 768-d. If you switch to a model with different dimensions, change `OLLAMA_EMBED_DIM` AND update the `vector(N)` size in the migration.

## 4. SearXNG (deep-research URL resolution)

**What it does:** when `deepResearch()` gets a firm name (not a URL), it now searches SearXNG for the actual homepage instead of guessing the slug. SearXNG aggregates DuckDuckGo, Bing, Brave, Startpage, Qwant.

**Code:** `lib/agents/web-search.ts` — `search()`, `findFirmHomepage()`, `isSearxngAvailable()`.
**Settings:** `scripts/searxng/settings.yml` — JSON output enabled, sane engine list.
**Wiring:** `lib/admin/deep-research.ts` calls `findFirmHomepage()` first; falls back to `guessUrlFromName()` when SearXNG isn't reachable.

**Setup:**
```bash
SEARXNG_SECRET=$(openssl rand -hex 32)
docker compose -f docker-compose.integrations.yml up -d searxng
```
Verify: `curl 'http://localhost:8080/search?q=acme+ventures&format=json'`

## 5. Marker (PDF → Markdown sidecar)

**What it does:** image-heavy decks (the kind partners actually send) come back from `pdf-parse` empty or with garbled glyphs. Marker uses small CV models to OCR + structure them into Markdown with headings.

**Architecture:**
- Python container (`scripts/marker/Dockerfile` + `server.py`) at `:8001`
- Node client `lib/ai/pdf-marker.ts` posts the PDF, gets Markdown back
- `lib/ai/pdf.ts:extractPdfText()` now tries pdf-parse first (cheap), then re-extracts via Marker when ≥50% of pages are image-only AND Marker is reachable. Tagged on `result.source = "marker" | "pdf-parse"`.

**No caller changes** — fund-deck-extractor, founder-deck-extractor, and pitch-deck-analyzer all benefit transparently.

**First-run note:** Marker downloads ~2 GB of model weights on first request; the container caches them in the `marker-cache` Docker volume. Subsequent boots are warm.

**Memory:** Marker is memory-heavy (~3 GB peak). The compose file caps it at 4 GB.

## 6. Vercel AI SDK — typed structured output

**What it does:** Anker has a lot of "ask the model for JSON, then try/catch parse" code. The AI SDK's `generateObject` does that with a zod schema and proper retry. Cleaner, typed, faster.

**Code:** `lib/ai/sdk-bridge.ts`
- `generateTyped(schema, prompt, opts)` — typed result, never throws
- `generateTypedAtLeast(schema, prompt, minConfidence)` — with confidence floor

Uses Ollama's OpenAI-compatible endpoint (`/v1/chat/completions`) via `@ai-sdk/openai-compatible`, routed through the same multi-model router as `provider.ts`.

**Existing `provider.ts` is unchanged** — every existing caller keeps working. New code paths can adopt the typed bridge incrementally; recommended targets:
- `lib/ai/fund-deck-extractor.ts`
- `lib/ai/fund-deck-analyzer.ts`
- `lib/ai/dm-personalizer.ts`
- `lib/ai/reply-handler.ts`
- `lib/admin/enrichment.ts`

## What landed where

```
lib/
  ai/
    embeddings.ts          # local embeddings via Ollama
    semantic-search.ts     # similar_*, near-dup
    sdk-bridge.ts          # AI SDK typed bridge
    pdf-marker.ts          # Marker sidecar client
    pdf.ts                 # extended: marker fallback
  admin/
    web-crawler.ts         # extended: Readability extractor
  admin/deep-research.ts   # extended: SearXNG URL resolution
  agents/
    web-search.ts          # SearXNG client
  twenty/
    client.ts              # GraphQL client
    sync.ts                # push + pull
app/api/
  twenty/sync/route.ts     # admin + per-entry endpoint
docker-compose.integrations.yml
  twenty + twenty-db + twenty-redis  # CRM
  searxng                            # search
  marker                             # PDF
scripts/
  searxng/settings.yml
  marker/Dockerfile + server.py
  migrations/2026-05-08-pgvector.sql
  backfill-embeddings.mjs
package.json
  +@ai-sdk/openai-compatible
  +@mozilla/readability + jsdom
  +graphql + graphql-request
  +crawlee + @crawlee/cheerio
```

## Roll-back

Each piece is independent. To remove any one:

- **Twenty:** unset `TWENTY_*` env, stop the compose service. `lib/twenty/sync.ts` no-ops when not configured.
- **SearXNG:** unset `SEARXNG_URL`. `deep-research` falls back to `guessUrlFromName`.
- **Marker:** unset `MARKER_URL`. PDFs go through pdf-parse only.
- **pgvector:** drop the `embedding`/`embedding_*` columns; semantic-search lib returns empty arrays gracefully.
- **Readability:** delete the lazy-load block in `extractText`; the regex pipeline takes over.
- **AI SDK bridge:** delete `lib/ai/sdk-bridge.ts`; nothing else imports it yet.

## Email check (Hunter.io)

Mirrors the URL-check tool but for investor emails.

**Configure:**

```bash
# Add to .env.local — get the key at https://hunter.io/api-keys
HUNTER_API_KEY=hk_…
```

After restart, `/dashboard/admin/email-check` does:

* **Bulk sweep** of `investors` rows where `email IS NOT NULL`, oldest-first.
* Per-row **Fix** dialog with three modes:
  * **Hunter** — runs the email-finder against the investor's firm domain + first/last name. Top-ranked guess is verified before apply.
  * **Local AI** — `qwen2.5` proposes a pattern (`first.last@domain` style) using the firm domain. Returns "UNKNOWN" when ambiguous.
  * **Manual** — paste an address, verifier runs once before apply.
* **Apply to DB** is gated — refuses unless the post-fix probe returns valid / risky / accept_all / webmail.

**Without `HUNTER_API_KEY`** the panel still works using format + DNS-MX checks. The verdict ladder collapses to `valid` / `webmail` / `disposable` / `no_mx` / `malformed` / `unknown` — no SMTP-grade confirmation. The fix dialog disables the Hunter tab and falls back to AI/manual.

**Code:**

* `lib/admin/hunter.ts` — verifier / finder / domain-search wrappers
* `lib/admin/email-check.ts` — `checkEmail` / `bulkCheck` / 11-bucket verdict map
* `app/api/admin/email-check/route.ts` — bulk endpoint
* `app/api/admin/email-check/fix/route.ts` — three-mode repair endpoint, gated on apply
* `components/admin/email-check-panel.tsx` — UI

**Roll back:** unset `HUNTER_API_KEY`. Email-check keeps working in fallback mode; nothing else in the platform depends on it.

**Security:** rotate the key from the Hunter dashboard after pasting it anywhere unsafe (chat, screenshots, etc.). Hunter has a "Regenerate" button next to each key.
