# Anker — feature integration checklist

> Inventory of every shipped feature, its wiring state, and what's
> deliberately deferred. Pair with [`AUDIT.md`](AUDIT.md) (route-by-
> route map) and [`INTEGRATIONS.md`](INTEGRATIONS.md) (open-source
> plumbing). Re-evaluated whenever something material lands.

Legend: ✅ shipped & wired · 🟡 shipped, partial wiring or env-gated ·
🔧 in progress · ⏸ deferred · ❌ removed

## 1. AI provider stack

| Capability | State | Notes |
|---|---|---|
| Multi-provider chain (`lib/ai/provider.ts`) | ✅ | Anthropic → OpenAI → Gemini → Qwen → Mistral with auto-failover on 429/5xx |
| Admin Settings → API Keys | ✅ | Per-provider keys + per-provider model override stored in `system_settings.ai_router_v1` |
| Task-tier routing (`lib/ai/model-router.ts`) | ✅ | `fast` / `balanced` / `deep` per task tag |
| Env-side override (`AI_PROVIDER`) | ✅ | Forces single provider, disables failover |
| Anthropic Claude (text + native PDF documents API) | ✅ | Primary in failover chain when key set |
| OpenAI (chat + Responses API for vision) | ✅ | Vision via `input_file` parts on `responses` endpoint |
| Google Gemini (chat + inline_data PDF) | ✅ | Vision via `inline_data: application/pdf` part |
| Mistral (chat only) | ✅ | OpenAI-compatible endpoint |
| Alibaba Qwen / DashScope | ✅ | Per-workspace base URL, OpenAI-compatible, Qwen-VL for images |
| Ollama (local) | 🟡 | Off by default; enable in Data Ops or `LOCAL_AI_ENABLED=true` |
| Vercel AI SDK typed bridge | ✅ | `lib/ai/sdk-bridge.ts` — opt-in per call site |
| `/api/diagnostics` runtime probe | ✅ | Returns env presence + DB reach + provider chain + one-shot probe |
| `/api/admin/ai-test` self-test | ✅ | Per-use-case probe with timing |
| `/api/ai/status` per-user badge | ✅ | Powers "Claude — ready" badge on Find Investors / LP pages |

## 2. PDF + multimodal extraction

| Capability | State | Notes |
|---|---|---|
| `pdf-parse` text extraction | ✅ | Cheap first pass |
| Sparseness detection | ✅ | image-only > 50% OR text < 200 chars → escalate |
| Qwen-VL-OCR page rendering (`lib/ai/pdf-ocr.ts`) | ✅ | pdfjs-dist + @napi-rs/canvas → PNG → Qwen-VL-OCR, 15 pages default cap |
| Unified vision dispatch (`lib/ai/pdf-vision.ts`) | ✅ | Pre-extracts text once, then dispatches to provider chain |
| Anthropic PDF documents API | ✅ | Native PDF input for image-heavy decks when Anthropic available |
| Marker sidecar (PDF → Markdown) | 🟡 | Container ready under `scripts/marker/`; `MARKER_URL` env-gated |
| Image upload to assistant | ✅ | base64 reference replaced server-side via `<<IMG1>>` token |
| Image generation (Qwen-Image, z-image-turbo, wan2.6) | ✅ | Async DashScope text2image, polled until done |
| PowerPoint output (`lib/decks/pitch-deck-builder.ts`) | ✅ | 16:9 LAYOUT_WIDE via pptxgenjs |
| PDF output | ✅ | pdf-lib (no headless browser) |
| Word output | ✅ | docx library with markdown-to-docx bridge |
| XLSX output | ✅ | Used for LP pipelines, outreach drafts, ranked tables |

## 3. LP matchmaking

| Capability | State | Notes |
|---|---|---|
| Fund profile editor (manual entry) | ✅ | `/dashboard/matchmaking` left panel |
| Fund-deck upload + extraction | ✅ | `/api/fund-deck/extract` |
| Six-lens LP analyst review | ✅ | `/api/fund-deck/analyze` returns score + claimsReviewed + lpObjections |
| Auto-OCR for image-only decks | ✅ | Same path as extract; degrades gracefully |
| Emerging-manager vs. established lens toggle | ✅ | Different weight profile per row |
| LP scoring engine (`lib/matching/v2/engine.ts`) | ✅ | Stage + sector + geo + check + thesis-similarity |
| Run history persistence | ✅ | `match_sessions` table on Neon |
| Top-200 LP shortlist export | ✅ | XLSX with tier + score + rationale |
| AI rationales per LP | ✅ | One-line "why this LP" for the top-200, batched + 429-safe |
| Word-doc critique export | ✅ | Pure docx render with score chart |

## 4. Find Investors (founder side)

| Capability | State | Notes |
|---|---|---|
| Pitch deck upload + critique | ✅ | 8-dimension scoring, missing-items list, suggested next steps |
| AI extraction of founder profile | ✅ | Auto-fills matchmaking inputs from deck |
| Run matching engine | ✅ | Reuses LP engine with founder weight profile |
| Pitch critique Word export | ✅ | docx with score chart (flat table, no nested tables → Word-safe) |
| Image-only deck handling | ✅ | OCR fallback path |

## 5. Outreach engine

| Capability | State | Notes |
|---|---|---|
| Resend send via `lib/email/resend.ts` | ✅ | Tracking pixel + click rewriter + RFC 2822 headers |
| Gmail OAuth send (`lib/email/gmail.ts`) | ✅ | Token refresh on demand, per-account routing |
| Per-row Send button | ✅ | Drawer with edit-before-send, choose Resend or Gmail |
| Bulk Send All | ✅ | Background loop with rate-limit gap |
| Campaign-level CC / BCC | ✅ | Persisted on `outreach_campaigns.cc_emails` / `bcc_emails` |
| Campaign signature with auto-append | ✅ | `outreach_campaigns.signature` text column |
| Threaded follow-ups | ✅ | In-Reply-To / References inferred from prior connection_request |
| IMAP inbox poller for replies | 🟡 | `lib/email/imap-poller.ts`; env-gated and not bundled (Vercel-incompatible) |
| Resend webhook events | ✅ | `/api/admin/email/sync-events` |
| Drafts UI per-row in Outreach Studio | ✅ | Drawer with subject + body + send |
| Import drafts from XLSX | ✅ | `/api/outreach/campaigns/[id]/import-drafts` |
| Folk CRM mirror | 🟡 | `lib/folk/client.ts` — env-gated on `FOLK_API_KEY` |
| Twenty CRM bidirectional sync | 🟡 | Documented in `INTEGRATIONS.md`; env-gated |
| LinkedIn DM drafting | ✅ | Same drafter, different channel, surfaced as paste-to-LinkedIn |

## 6. Discover + investor database

| Capability | State | Notes |
|---|---|---|
| Firm browser with filters | ✅ | `/dashboard/discover` and `/dashboard/investors` |
| Pagination over 18k+ firms | ✅ | Server-rendered with SWR client |
| Semantic search (`pgvector`) | ✅ | `similarFirms()` + `similarInvestors()` |
| Cleanup script | ✅ | `scripts/cleanup-investors-firms.sql` |
| Idempotent ingest scripts | ✅ | `scripts/ingests/*.sql` for curated datasets |
| Latest ingest: 8fr LP-drop-04 (150 US FOs) | ✅ | +150 investors, +102 firms |
| Latest ingest: Folk EU FO founders (147) | ✅ | +100 investors, +1 firm |
| LinkedIn scrape agent | ✅ | `/api/agents/linkedin/ingest-batch` + Claude-in-Chrome paste-HTML dialog |
| Per-firm Folk linkback | ✅ | `investment_firms.folk_id` |

## 7. CRM + pipeline

| Capability | State | Notes |
|---|---|---|
| `crm_entries` per (user, target firm/investor) | ✅ | Tracks stage, notes, research summary, last interaction |
| Stage transitions + log | ✅ | Outreach drives stage forward automatically |
| Per-entry research synthesis | ✅ | One-button "research this contact" via deep-research agent |
| LinkedIn data JSONB on crm_entries | ✅ | Stores last-known profile snapshot from the LinkedIn agent |
| Pipeline board UI | ✅ | `/dashboard/pipeline` |
| CRM boards (custom Kanban) | ✅ | `/api/crm/boards` + entries |
| Activity log | ✅ | `activities` + `activity_logs` |

## 8. AI assistant (autonomous agent)

| Capability | State | Notes |
|---|---|---|
| ReAct tool loop (`lib/assistant/agent.ts`) | ✅ | Max 6–10 steps, force-synthesis on bound |
| File upload (multipart/form-data) | ✅ | Up to 25 MB/file, 75 MB total |
| PDF → text injection for prompts | ✅ | Via `extractPdfText` before agent loop |
| Image upload with server-side reference | ✅ | `<<IMG1>>` token replaced at tool dispatch |
| Tool: `web_search` (SearXNG) | 🟡 | `SEARXNG_URL` env-gated; falls back to fail-soft |
| Tool: `web_crawl` (Readability + crawlee) | ✅ | Auto-falls back to regex if Readability declines |
| Tool: `matchmake_lps` | ✅ | Runs the LP engine in-tool |
| Tool: `score_investors` | ✅ | Bounded batch up to 40 |
| Tool: `draft_outreach_batch` | ✅ | Bounded batch up to 25 |
| Tool: `enrich_firms` | ✅ | Bounded batch up to 10 |
| Tool: `query_investors` | ✅ | Direct SQL with NL→SQL inference |
| Tool: `build_investor_profile` | ✅ | Multi-source synthesis |
| Tool: `generate_spreadsheet` | ✅ | Markdown-table → xlsx |
| Tool: `generate_document` | ✅ | Markdown → docx |
| Tool: `create_pitch_deck` | ✅ | Structured slides → pptx + pdf |
| Tool: `improve_pitch_deck` | ✅ | Same builder, takes revised outline |
| Tool: `analyze_image` (Qwen-VL-Plus) | ✅ | image_url part on OpenAI-compat |
| Tool: `ocr_image` (Qwen-VL-OCR) | ✅ | Specialised OCR model |
| Tool: `generate_image` (z-image-turbo / qwen-image / wan2.6) | ✅ | Async DashScope, polled |
| Tool: `translate_text` (Qwen-MT-Flash) | ✅ | 92 languages |
| Artifact storage on Vercel | ✅ | `/tmp/anker-artifacts/` + `/api/artifacts/[file]` streamer |
| Artifact storage locally | ✅ | `public/generated/` + Next static handler |

## 9. Newsroom

| Capability | State | Notes |
|---|---|---|
| Public `/newsroom` index | ✅ | Editorial masthead, lead-story block, category filter, ledger |
| Public `/newsroom/[id]` article | ✅ | Drop-cap, serif H2/H3, styled inline citations, sources list |
| Markdown renderer (`lib/newsroom/markdown.ts`) | ✅ | Headings, bold/italic, lists, blockquotes, citation spans |
| Read-time estimator | ✅ | `readTimeMinutes()` |
| Citation extractor | ✅ | Builds dedup'd `Sources & references` list |
| Admin draft + publish | ✅ | `/dashboard/admin/newsroom` |
| AI-drafted articles | ✅ | `lib/admin/newsroom-writer.ts` |
| Confidence score badge | ✅ | Surfaced on article header |

## 10. Auth + access

| Capability | State | Notes |
|---|---|---|
| Supabase Auth (cookies / SSR) | ✅ | `lib/supabase/server.ts` |
| Local-mode shim | ✅ | `LOCAL_AUTH_BYPASS=true` for offline dev |
| Sign-in / sign-up routes | ✅ | `/api/auth/sign-in` + `/api/auth/sign-up` |
| Admin gate (`requireAdmin`) | ✅ | Per-user `role` on Supabase metadata |
| Gmail OAuth flow | ✅ | `/api/auth/gmail/start` + `/api/auth/gmail/callback` |

## 11. Database + ops

| Capability | State | Notes |
|---|---|---|
| Neon production (Postgres 17) | ✅ | 18k firms, 47k people, 12k CRM, 21 news articles |
| Local PGlite mode | ✅ | `LOCAL_DB=true`; in-process WASM Postgres |
| `pgvector` extension | ✅ | 768-d embeddings on firms / investors / crm_entries |
| `system_settings` jsonb runtime config | ✅ | AI router stored here |
| Idempotent ingest pattern | ✅ | Re-runnable for any curated dataset |
| Cleanup script with backup tables | ✅ | Wrapped in BEGIN/ROLLBACK by default |
| Migration runner (manual `psql -f`) | ✅ | No automatic runner; deliberate for control |
| Folk CRM ID linkback | ✅ | `investment_firms.folk_id` + `crm_entries.folk_id` |

## 12. Production posture

| Capability | State | Notes |
|---|---|---|
| Vercel deployment with `maxDuration` per route | ✅ | extract 120 · analyze 240 · assistant 300 |
| `serverExternalPackages` for native deps | ✅ | `@napi-rs/canvas`, `pdfjs-dist`, `pg`, `pdf-parse`, `docx`, etc. |
| `/api/diagnostics` for production triage | ✅ | One JSON view of runtime state |
| Artifact storage in `/tmp/` on serverless | ✅ | EROFS fallback handled |
| Cold-start warm reuse | ✅ | Provider chain + DB pool cached per instance |
| Webhook receiver (Resend) | ✅ | `/api/admin/email/sync-events` |

## 13. Deferred / future

| Capability | State | Notes |
|---|---|---|
| Audio transcription (Qwen3-ASR / Fun-ASR) | ⏸ | Audio uploads accepted; transcription not wired |
| Video generation (HappyHorse / Wan2.7) | ⏸ | No use case in app yet |
| Voice replies / TTS in assistant | ⏸ | CosyVoice + Qwen3-TTS available, not wired |
| Learned ranker for LP matching | ⏸ | Need ≥10k labelled outcomes first |
| Federated firm dedup via pgvector | ⏸ | Cosine similarity over embeddings |
| Audit-grade extraction logs | ⏸ | Per-field provenance trail |
| Cross-article citation graph (newsroom) | ⏸ | Per-(source, year) backlinks |
| Edge-runtime moves for hot paths | ⏸ | Currently all Node runtime |
| Stripe billing | ⏸ | Schema sketched, not wired |
| Vercel Blob for artifacts | ⏸ | `/tmp/` is ephemeral; Blob adds persistence |

## 14. Reading order

1. [`README.md`](README.md) — what the platform is.
2. [`ANKER_SCIENTIFIC_THESIS.md`](ANKER_SCIENTIFIC_THESIS.md) — the
   principles every scoring or extraction decision honours.
3. This file — what's built, where it lives, what's deferred.
4. [`AUDIT.md`](AUDIT.md) — route inventory with owners.
5. [`INTEGRATIONS.md`](INTEGRATIONS.md) — open-source plumbing details.
6. [`DEPLOY.md`](DEPLOY.md) — Vercel + Neon + Supabase setup.
7. [`RUNBOOK.md`](RUNBOOK.md) — production triage playbook.

---

Refresh policy: this file gets updated whenever a row's state changes.
The git log of this file is the timeline.
