# Anker — Venture-capital intelligence for fund managers, LPs, and founders

Anker is an AI-native platform for private-capital workflows: investor and
LP discovery, fund-deck analysis, outreach automation, CRM, deal-flow
management, and an autonomous research assistant.  It runs on Next.js 16
(App Router + Turbopack), Postgres (Neon in production, local Postgres or
PGlite in dev), and a multi-provider AI stack with automatic failover.

The platform serves three audiences in one codebase:

- **Fund managers** raising capital → LP matchmaking, fund-deck critique,
  campaign-grade outreach with per-row drafts, Gmail / Resend dual-sender,
  Folk CRM mirror.
- **LPs and family offices** screening managers → fund-deck LP analyst
  review with claims verification, source-anchored extraction, and a
  six-lens scorecard.
- **Founders** running a round → investor discovery, pitch-deck critique,
  data-room organisation, CRM-light pipeline, intro-draft generation.

## Quick start

```bash
git clone https://github.com/345668/Anker.git
cd Anker
pnpm install
cp .env.example .env.local             # then fill in keys (see § Environment)
pnpm dev                                # http://localhost:3000
```

Minimum to make AI features work: any one of
`ANTHROPIC_API_KEY` · `OPENAI_API_KEY` · `GEMINI_API_KEY` ·
`MISTRAL_API_KEY` · `DASHSCOPE_API_KEY` (Qwen) — or set the same keys
via **Settings → API Keys** in the dashboard once you're signed in.

For deployment to Vercel + Neon + Supabase, see [`DEPLOY.md`](DEPLOY.md)
and the runtime troubleshooting checklist in [`RUNBOOK.md`](RUNBOOK.md).

## What's in the app

```
/dashboard                  Founder + manager home with KPI cards
/dashboard/find-investors   Founder → VC matching with deck critique
/dashboard/matchmaking      Fund → LP matching, LP analyst review
/dashboard/discover         Investor / firm explorer (~18k firms, ~47k people)
/dashboard/investors        Paginated browser with semantic search
/dashboard/pipeline         Deal-flow board with CRM integration
/dashboard/outreach         Email + LinkedIn campaigns with drafts + send
/dashboard/crm              Per-entry research, notes, stage transitions
/dashboard/documents        Deck + data-room uploader with AI extraction
/dashboard/assistant        Autonomous research agent + multimodal upload
/dashboard/data-room        Founder-side document organisation
/dashboard/newsroom         Editorial newsroom with structured citations
/dashboard/admin/*          AI keys, system health, ingest, news drafts
```

See [`AUDIT.md`](AUDIT.md) for a route-by-route map and
[`FEATURE_INTEGRATION_CHECKLIST.md`](FEATURE_INTEGRATION_CHECKLIST.md)
for the full inventory of shipped capabilities.

## Architecture in one screen

```
            ┌─────────────────────────────────────────────┐
            │  Next.js 16 (App Router · Turbopack)        │
            │  ├── /dashboard       React Server Comps    │
            │  └── /api/*           Node-runtime routes   │
            └────────────────┬────────────────────────────┘
                             │
       ┌─────────────────────┼────────────────────────────┐
       ▼                     ▼                            ▼
┌──────────────┐    ┌────────────────────┐    ┌─────────────────────┐
│  Postgres    │    │  AI provider chain │    │ External services   │
│  Neon (prod) │    │  Anthropic →       │    │  Resend  · Gmail    │
│  + pgvector  │    │   OpenAI →         │    │  Folk CRM           │
│  local PGlite│    │    Gemini →        │    │  Twenty CRM         │
│  in dev      │    │     Qwen →         │    │  Hunter.io          │
│              │    │      Mistral       │    │  SearXNG            │
│  18k firms   │    │       (Ollama)     │    │  Marker (PDF→MD)    │
│  47k people  │    │                    │    │  Supabase Auth      │
│  12k CRM     │    │  Auto-failover     │    │                     │
└──────────────┘    └────────────────────┘    └─────────────────────┘
                             │
                             ▼
                  ┌─────────────────────────┐
                  │  Modality bridges       │
                  │  pdf-vision (4 paths)   │
                  │  pdf-ocr (Qwen-VL-OCR)  │
                  │  pdf-parse → text       │
                  │  napi-canvas → PNG      │
                  │  pptxgenjs → .pptx      │
                  │  pdf-lib → .pdf         │
                  │  docx → .docx           │
                  └─────────────────────────┘
```

## Key capabilities

**Multi-provider AI with automatic failover.** Set one key, get failover
across the rest. Per-task model routing (`fast` / `balanced` / `deep`)
in `lib/ai/model-router.ts`. Admin **Settings → API Keys** is the single
source of truth; falls back to env. PDF vision tries Anthropic →
OpenAI → Gemini → Qwen-VL in that order — every provider gets pre-
extracted text so no provider hallucinates from filename alone.
[`/api/diagnostics`](app/api/diagnostics/route.ts) returns a structured
runtime snapshot so production 500s are diagnosable from a browser.

**LP matchmaking + fund-deck analyst review.** Upload a fund deck and
the system extracts the structured profile (fund I/II, target raise,
sectors, GPs, thesis, prior portfolio) and runs a six-lens LP critique
(GP background, sector focus, market analysis, thesis vs. trends, fund
unit economics, claims verification). Image-only decks are OCR'd
page-by-page via Qwen-VL-OCR before extraction so the model sees real
content, not the filename. Result: real extracted profiles with
source-anchored notes, not fabricated placeholder names.

**Investor / family-office database.** Curated ingests of investor
lists with idempotent SQL scripts (`scripts/ingests/*.sql`). Most recent
adds: 150 US family offices (8fundraising LP-drop-04) and 100 European
family-office founders (Folk CRM export). All deduped against existing
rows by case-insensitive name match for firms and email or (firm, name)
for people.

**Outreach engine.** Campaign-level CC/BCC, signature templates, Gmail
OAuth sender alongside Resend, per-row drafts with edit-before-send,
auto-append campaign signature, threading via RFC 2822 headers, tracking
pixel + click rewriter when `TRACK_VIA_APP=true`. Folk CRM mirror for
contact sync. Per-message status flips to `sent` / `delivered` /
`replied` via Resend webhooks + IMAP inbox poller.

**Autonomous assistant.** ReAct-style tool loop with file upload (PDFs,
images, text), pitch-deck creation in `.pptx` + `.pdf` with generated
slide images (Qwen text-to-image), in-tool LP matchmaking, web research
(SearXNG), document creation (`.docx` / `.xlsx`), OCR (`qwen-vl-ocr`),
image generation (`z-image-turbo` / `qwen-image-2.0` / `wan2.6-t2i`),
translation (`qwen-mt-flash`). Artifact storage auto-detects Vercel
serverless and writes to `/tmp/` with a dynamic
`/api/artifacts/[file]` streamer; locally writes to `public/generated/`.

**Editorial newsroom.** Markdown articles rendered with semantic
typography (drop-cap, serif headings, styled inline citations), source
attribution list, read-time estimate, byline with confidence score.
Lead-story block, category filter, magazine-style ledger.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16, App Router, Turbopack, React Server Components |
| Runtime | Node 22, deployed to Vercel; local dev on `pnpm dev` |
| DB | Postgres (Neon in prod, PGlite/local in dev), `pgvector` for semantic search |
| Auth | Supabase Auth (cookie-based SSR) + local-mode shim for offline dev |
| AI | Anthropic Claude · OpenAI · Google Gemini · Mistral · Alibaba Qwen · Ollama |
| Email | Resend (primary) + Gmail OAuth (secondary sender), IMAP poller for replies |
| CRM mirror | Folk CRM (API) + Twenty CRM (self-hosted) |
| PDF | `pdf-parse` for text · `pdfjs-dist` + `@napi-rs/canvas` for OCR · `pdf-lib` for output |
| Other AI utilities | `pptxgenjs` (.pptx), `docx` (.docx), Vercel AI SDK (typed structured output) |

## Environment

Minimum to run locally:

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/anker
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# Any one of these enables AI:
ANTHROPIC_API_KEY=sk-ant-...
# or
DASHSCOPE_API_KEY=sk-...  +  QWEN_WORKSPACE_ID=ws-...
```

Optional but powerful:

```bash
RESEND_API_KEY=re_...                         # outbound email
OUTREACH_FROM_EMAIL=vc@an-ker.de
GOOGLE_OAUTH_CLIENT_ID=... + GOOGLE_OAUTH_CLIENT_SECRET=...   # Send via Gmail
FOLK_API_KEY=FOLK...                          # CRM mirror
HUNTER_API_KEY=...                            # email verification
SEARXNG_URL=http://localhost:8080             # better deep-research URLs
MARKER_URL=http://localhost:8001              # PDF → Markdown sidecar
LOCAL_DB=true                                 # PGlite in-process DB
LOCAL_AUTH_BYPASS=true                        # skip Supabase auth locally
```

Full list in [`.env.example`](.env.example).

## Database & migrations

The platform uses raw SQL migrations under `scripts/migrations/`
applied with `psql`. Ingests for curated datasets live in
`scripts/ingests/` and are idempotent — re-running skips already-
present rows. Current row counts on Neon production:

```
investment_firms     18,276    (367 family offices)
investors            46,714    (100 from Folk EU FO drop, 150 from 8fr drop)
crm_entries          12,189
outreach_messages       698
news_articles            21
```

The Neon cleanup script `scripts/cleanup-investors-firms.sql` strips
duplicate-token names ("Cynthia Ringo Ringo") and removes corrupt rows;
it's safe and wrapped in `BEGIN / ROLLBACK` until you flip to `COMMIT`.

## Local development

```bash
pnpm dev                                       # Turbopack dev server
pnpm tsc --noEmit -p tsconfig.json             # type-check
pnpm lint                                      # ESLint
```

If you don't have Postgres locally, set `LOCAL_DB=true` and the runtime
uses an in-process PGlite WASM backend with the same schema. Set
`LOCAL_AUTH_BYPASS=true` to skip Supabase auth for offline development.

## Deployment

Production runs on Vercel + Neon + Supabase. Function `maxDuration`
already configured per route (extract: 120 s, analyze: 240 s, assistant:
300 s). The OCR fallback can hit the Vercel Hobby 10 s limit on long
decks — you'll want Pro or above for image-heavy pitch decks. The
`@napi-rs/canvas` and `pdfjs-dist` packages are pinned to
`serverExternalPackages` in `next.config.mjs` so Turbopack doesn't
bundle the native binary.

`/api/diagnostics` is the first stop for any production 500 — it
reports the runtime view of every env var, DB reachability, AI provider
chain state, and a one-shot probe of the active model.

## Repository layout

```
app/                  Next.js routes (page.tsx + route.ts)
components/           React UI (mostly under components/tesseract/)
lib/                  Application logic, organised by domain:
  ai/                 Provider chain, vision, OCR, embeddings, extractors
  assistant/          Agent loop + tool registry
  ai/                 Multi-provider AI utilities
  matching/v2/        LP + investor matching engines
  outreach/           Campaign engine, drafters, send orchestration
  newsroom/           Article markdown renderer + citation extractor
  decks/              Pitch-deck builder (pptx + pdf)
  email/              Resend + Gmail OAuth + IMAP poller
  folk/               Folk CRM client
  twenty/             Twenty CRM client + sync
  db/                 Driver + queries + types
scripts/              Migrations, ingests, ops scripts
docs/                 (see AUDIT, DEPLOY, INTEGRATIONS, RUNBOOK at root)
public/               Static assets + templates + generated artifacts
```

## Reading order if you're new to the codebase

1. [`ANKER_SCIENTIFIC_THESIS.md`](ANKER_SCIENTIFIC_THESIS.md) — the principles
   behind every scoring, matching, and extraction decision.
2. [`AUDIT.md`](AUDIT.md) — route-by-route inventory with owners.
3. [`FEATURE_INTEGRATION_CHECKLIST.md`](FEATURE_INTEGRATION_CHECKLIST.md) —
   what's built, what's wired, what's deferred.
4. [`INTEGRATIONS.md`](INTEGRATIONS.md) — open-source plumbing (Twenty,
   Readability, pgvector, SearXNG, Marker, AI SDK).
5. [`DEPLOY.md`](DEPLOY.md) — Vercel + Neon + Supabase setup.
6. [`RUNBOOK.md`](RUNBOOK.md) — production triage.

## License

Proprietary — Anker Consulting. Contact for licensing terms.
