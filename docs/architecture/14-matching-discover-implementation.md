# 14 — Implementation architecture: matching v3, Discover v2, inputs and outputs

**Date:** 2026-09-22 · **Status:** built 2026-09-22/23 — see §12 for what shipped and what did not · **Implements:** doc 10 (gap
analysis), doc 11 (scoring), doc 12 (persona discovery), doc 13 (email
verification). This document is the system model the code follows; each
section names its modules, tables, routes and the tests that hold it.

---

## 1. Module map

```
lib/db/index.ts                     driver: .query first (Neon), .unsafe only for PGlite        §2
lib/ai/embeddings.ts                embed(text, { provider, model, dim })                         §3
lib/matching/v2/semantic.ts         corpus model + live column dim; same-model comparisons only   §3
lib/matching/normalize/             ONE vocabulary for engine and Discover                        §4
  text.ts                             word/phrase tokeniser
  sectors.ts                          groups, horizontal/vertical/generic classes
  stages.ts  types.ts  titles.ts      stage synonyms, investor classes, seniority
  geo.ts                              country + macro-region resolver (word boundaries)
  money.ts                            "$50K-$250K" → [50000, 250000]
lib/matching/v2/founder-scoring-v3.ts  doc 11 model — pure functions                              §5
lib/matching/v2/founder-grouping.ts    firm groups, contact rank, independents                    §5
lib/matching/v2/founder-engine.ts      load → exclude → score → group → rank → verify → persist   §5
lib/matching/v2/founder-runs.ts        runs + results tables (replaces the 24 h JSONB cache)      §6
lib/email-verification/               local stage, provider adapters, cache, budget              §7
lib/files/zip.ts  office-text.ts      ZIP read/write; PPTX/DOCX text                             §8
lib/net/safe-fetch.ts                 SSRF-guarded fetch for deck URLs                            §8
lib/platform/directory-normalize.ts   fills norm_* columns + facets                              §9
lib/platform/discovery.ts             lenses, projections, filters, fit, semantic search         §9
```

## 2. Database driver (doc 10 D1)

`sql.unsafe(text, params)` calls `driver.query` when present (Neon, pg) and
`driver.unsafe` only otherwise (PGlite). **Review before shipping** — each of
the 21 call sites has been returning no rows in production:

| Call site | What changes when it gets rows | Verdict needed |
| --- | --- | --- |
| `lib/platform/discovery.ts` | Discover loads | rewritten in §9 anyway |
| `lib/matching/v2/semantic.ts`, `lib/ai/semantic-search.ts` | similarity results appear | intended |
| `lib/matching/access.ts` | VC/LP match actions find their match (was 404) | query is org-scoped ✓ |
| `app/api/lp/pipeline/stage/route.ts` | the stage `UPDATE` executes for the first time | `table` from a fixed pair, columns from a fixed set — check before ship |
| `lib/portfolio/queries.ts`, `lib/portfolio/data-room.ts` | portfolio and data-room lists fill | scoped by fund/org ✓ |
| `lib/newsroom/queries.ts` | the minimal/full select paths return rows | intended |
| `app/api/admin/system/route.ts`, `app/api/campaign/embeddings/route.ts` | counters are real | owner-gated ✓ |

`updateStartup` (`lib/db/platform-queries.ts`) — no callers, pastes values
into SQL — is deleted.

**Test:** a Neon-shaped fake driver (both `.query` and `.unsafe`, where
`.unsafe` returns a non-promise object) → `sql.unsafe` returns rows; a
PGlite-shaped fake (only `.unsafe`) → still used.

## 3. Embeddings (doc 10 D2, D3)

- `embed()` takes `{ provider, model, dim }`. Dimension comes from the **live
  column** (`format_type(atttypid, atttypmod)` → `vector(1024)`), cached per
  process; `EMBED_DIM` still overrides.
- `semantic.ts` finds the **corpus model** (`embedding_model` of the stored
  vectors, most common), embeds the startup with that provider and model, and
  filters neighbours with `embedding_model = $model`. If the corpus provider
  has no key or fails, the result says `semantic: { status: "unavailable",
  reason }` — never a silent 0.
- Calibration per doc 11 §4.2: rank-based over every stored vector, with the
  75th percentile as zero (revised from p50/p95 during the build).

## 4. One vocabulary (doc 11 §2, doc 10 L7)

Every match is on **words and phrases**, never substrings. The tokeniser
lower-cases, splits on non-alphanumerics (keeping `&`, `/` inside tokens such
as `ar/vr`), and looks up 1–4-word n-grams in maps built from the existing
synonym groups. Classes:

- sectors → group ids, each `vertical | horizontal`; generic markers flag a
  generalist;
- stages → the seven startup stages (wider synonyms, doc 11 §4.3);
- investor class → `vc | cvc | angel | accelerator | family_office | pe |
  allocator_* | grant | other` (doc 12 §2);
- titles → seniority 1.0 / 0.7 / 0.4;
- geography → ISO country (names, US states and major cities, "USA", "U.S.")
  → macro-region.

The engine and Discover import the same module, so a filter in Discover and a
score in matching can never disagree about what "US" or "sports" means.

## 5. Engine v3

```
load        firms + people (projected columns incl. typical_investment,
            investor_country, title, num_lead_investments, aum, norm_*)
exclude     CRM (org) beyond "queued" · email_suppressions · named excludes
            · excluded investor classes                        → counts
semantic    corpus-model neighbours, calibrated
score       doc 11 components → gates → caps → tier            (floats)
group       firms ← people by firm_id; contact rank; primary + 2 alternates;
            people without a directory firm → independents
rank        score, s_sem, Q, name, id
cap         maxFirms / maxIndependents after ranking; qualified counted BEFORE the cap
verify      stage 1 for every listed email; stage 2 for primaries of the top 200 groups
rationale   AI sentence for the top 50 groups (enableAi)
persist     run + results; match_shown for the top 200 groups
```

**Result shape** keeps `firms` and `contacts` (so existing exports keep
working) and adds `groups`, `independents`, `semantic`, `exclusions`,
`engineVersion: "founder-v3"`. Each entity carries `components`, `gates` and
`caps`.

**Tests:** pure unit tests for every component and gate (doc 11 tables);
grouping invariants; the the test deck integration test gains the doc 11 §8 acceptance
checks.

## 6. Runs and results (doc 10 L10, O7)

```sql
founder_match_runs    (id PK, org_id, user_id, profile_version_id, engine_version,
                       options jsonb, startup jsonb, totals jsonb, tier_counts jsonb,
                       segment_counts jsonb, funnel jsonb, semantic jsonb,
                       created_at, expires_at DEFAULT now() + 180 days)
founder_match_results (run_id, rank, kind ('group'|'independent'), entity_id,
                       firm_id, score real, tier, name, payload jsonb,
                       PRIMARY KEY (run_id, kind, rank))
startup_profiles      (id PK, org_id, version, fields jsonb, provenance jsonb,
                       created_by, created_at)
founder_match_exclusions (org_id, entity_key, reason, created_by, created_at,
                       PRIMARY KEY (org_id, entity_key))
```

Results are inserted in batches of 500 with `unnest`. The export and the
result browser read from these tables; the 24-hour `founder_match_sessions`
cache is retired (its module becomes a thin wrapper).

**Routes**

| Route | Purpose |
| --- | --- |
| `POST /api/founder/matching/run` | runs v3; accepts the new inputs and options; returns the summary + first page |
| `GET /api/founder/matching/runs` | this workspace's run history |
| `GET /api/founder/matching/runs/[id]/results` | paged, filterable (kind, tier, email status, text) |
| `POST /api/founder/matching/runs/[id]/actions` | `save` (to CRM) · `exclude` · `include` for one or many keys |
| `GET/POST /api/founder/profile` | latest profile / save a new version with provenance |
| `GET /api/founder/export/[id]?format=` | `xlsx` · `lists` (ZIP of ≤200-row files) · `csv` · `manifest` · `methodology` · `outreach` |
| `POST /api/crm/import-run` | import selected groups from a run by id — no file |

## 7. Email verification

As doc 13. `lib/email-verification/{local,providers,service,labels}.ts`,
`POST /api/email-verification`, `GET /api/cron/verify-emails` (daily; fails
closed without `CRON_SECRET`), table `email_verifications`.

## 8. Inputs (doc 10 §5)

- **Schema** (`startupSchema`) adds: `instrument`, `valuationCap`,
  `valuationCapType`, `leadStatus`, `committedAmount`, `targetCloseDate`,
  `geographyTargetRegions`, `investorTypesWanted`, `investorTypesExcluded`,
  `excludedInvestors`, `businessModel`, `customerSegment`, `namedCustomers`,
  `useOfFunds`, `competitors`, `pitchDeckSummary`, `founderBios`,
  `dataRoomSummary`. Extraction asks for the same fields with evidence.
- **Deck sources:** PDF, **PPTX, DOCX** (text from the Office XML, via
  `lib/files/zip.ts`), TXT/MD/CSV/JSON; a **deck URL** (`https` only; DNS
  resolved and private, loopback and link-local ranges refused; ≤ 3 redirects,
  each re-checked; 20 MB, 15 s; PDF or HTML → Readability text).
- **Large decks:** above 4 MiB the browser uploads straight to Vercel Blob
  with **private** access through `POST /api/founder/deck-upload`
  (founder-persona token, PDF/PPTX/DOCX only, ≤ 25 MB); extraction reads the
  blob server-side and deletes it afterwards.
- **Persistence:** the reviewed profile is saved as a new `startup_profiles`
  version with per-field provenance (`deck`, `typed`, `workspace`) before each
  run; the page loads the latest version.

## 9. Discover v2 (doc 10 §7, doc 12)

- **Normalised columns** on `investment_firms` and `investors`:
  `norm_country`, `norm_region`, `norm_sectors text[]`, `norm_stages text[]`,
  `norm_class`, `check_min`, `check_max`, `normalized_at`; GIN indexes on the
  arrays. Filled by `lib/platform/directory-normalize.ts` — a backfill now,
  then the daily cron for rows whose `updated_at > normalized_at`.
- **Facets** from `discovery_facets (lens, kind, facet, value, n)`, rebuilt by
  the same job. No per-request table scans.
- **Lenses** (doc 12 §6): each lens fixes the base filter (investor classes,
  or `startups.is_public`, or `funds.listed_for_lps`) and an explicit column
  list. **A test asserts the payload keys of every lens**: no phone, address,
  embedding, metadata or Folk fields for any persona.
- **Fit:** rows join the workspace's latest founder run; "Sort by fit" orders
  by that run's score. **CRM status** joins the workspace's CRM; "Hide saved"
  filters it out.
- **Semantic search** when the query is a phrase (≥ 2 words), through §3.
- **Saving:** firms and people; bulk save in one request (≤ 200); CRM source
  `discover` (constraint widened).
- **Export:** CSV of the selection, ≤ 200 rows, audited, daily cap 1,000.
- **Saved searches:** `discovery_saved_searches (id, org_id, user_id, lens,
  name, filters, created_at)`.
- **Removed:** "URL check — not available yet", `totalMatches: 0`, the nine
  retired stubs in `app/dashboard/discover/actions.ts`.
- **LP:** `/lp/discover` inside the LP portal, lenses "Fund managers" and
  "Funds on Anker"; `funds.listed_for_lps boolean DEFAULT false`.

## 10. Migrations (additive only)

`2026-09-22-matching-v3.sql`: runs, results, profiles, exclusions, outcome
source `founder_match`, CRM source `discover`, `email_verifications`,
normalised directory columns and indexes, `discovery_facets`,
`discovery_saved_searches`, `funds.listed_for_lps`.

## 11. Order of work and what proves each step

| Step | Proves it |
| --- | --- |
| Driver | fake-driver unit tests; Discover query returns rows on the DB |
| Embeddings | test-deck run reports `semantic.status = "ok"` and non-zero semantic components |
| Vocabulary | unit tests: "software" ∌ AR/VR, "retail" ∌ AI, "Amsterdam, Netherlands" → NL/Europe, "Salt Lake City" → US |
| Scoring v3 + grouping | component/gate unit tests; the test deck acceptance (doc 11 §8) |
| Runs, results, exports, import-by-run | round-trip test: run → results page → lists ZIP → import 3 groups → 3 CRM rows |
| Email verification | adapter mapping tests (mocked HTTP), budget cap test, local-stage tests |
| Inputs | schema tests; PPTX/DOCX text tests; SSRF guard tests (private IPs, redirects) |
| Discover v2 | payload-key test per lens; filters on normalised columns; timing on the DB |


---

## 12. What shipped (2026-09-23)

Measured on the production database and the test deck. Full unit suite: **498
passing**; production build clean.

| Step | Outcome |
| --- | --- |
| **Driver** (§2) | `sql.unsafe` runs the query on Neon. `updateStartup` deleted. Unit tests cover a Neon-shaped driver (both methods) and a PGlite-shaped one. |
| **Embeddings** (§3) | Query vectors take the live column's 1,024 dimensions and the corpus's own model; neighbours filtered by `embedding_model`. The test-deck run reports `semantic: ok`, every investor scored (~66k vectors, ~2 s). |
| **Vocabulary** (§4) | Whole-word matching everywhere. US firms 8,627 → **6,743** (no Swiss, Dutch, Polish, Finnish, Irish or Nigerian firm reads as US); AR/VR firms 9,565 → **169**; people with a usable check range 248 → **41,787**. |
| **Scoring v3 + grouping** (§5) | Built to doc 11, including focus decay and rank-calibrated semantics. The test deck: top 200 are **99% sports/health** (was 44%), **187 Champions** (was 2,119), largest tie on the full ranking key **2**. |
| **Runs, results, exports, import** (§6) | `founder_match_runs` / `founder_match_results` / `startup_profiles` / `founder_match_exclusions` live; results paged in the app; exports as xlsx, ZIP of ≤200 lists, CSV, manifest, methodology, outreach; `POST /api/crm/import-run` needs no file. `match_shown` recorded for the top 200 groups. |
| **Email verification** (§7) | Local stage (syntax, role, disposable, bounce history, MX) always on; ZeroBounce and NeverBounce adapters behind `EMAIL_VERIFICATION_API_KEY`; cache, daily budget, bounce feedback from sending. **No provider key is configured, so nothing reads "Verified" yet.** |
| **Inputs** (§8) | Round terms, lead status, targeting, exclusions and company context reach the engine; deck summary and founder bios no longer stripped; PPTX/DOCX read directly; deck URLs fetched behind an SSRF guard; decks over 4 MB upload privately to Blob and are deleted after extraction; the profile is saved per workspace with per-field provenance. |
| **Discover v2** (§9) | Lenses per persona (founder · VC: LPs/co-investors/startups · LP: managers/funds at `/lp/discover`). First page **894 ms** (was 40 s) and **92 KB** (was 1,456 KB); no phone, address, embedding, metadata or Folk fields in any payload; the people check-size filter returns 23,692 rows (was 0); facets materialised; semantic search; fit and CRM status on every row; CSV export capped and recorded; saved searches. |

### What is NOT built, and why

The first four entries below were closed in the second phase — see §13.

- ~~**Recency / activity signals (doc 10 L5).**~~ Built: doc 16.
- ~~**Traction fit (L9).**~~ Measured and deliberately not built: doc 16 §3.
- ~~**A learned ranker (L11).**~~ Built, and inactive by design: doc 17.
- ~~**Opt-in toggles.**~~ Built: doc 15.
- **Alerts on saved searches.** Searches can be saved and re-run; e-mailing
  new matches is not built.
- **Export audit.** Exports are counted and rate-limited per workspace per day
  in `discovery_exports`; they are not yet written to the doc-08 audit trail.
- **VC → LP matching** remains broken for a separate reason (its tables do not
  match its code); tracked as its own task, not part of this work.

---

## 13. What shipped in the second phase (2026-09-23)

Full unit suite **545 passing, 16 skipped**; typecheck and production build
clean.

| Step | Outcome |
| --- | --- |
| **SAIL-managed verification key** (doc 13 §6) | The ZeroBounce/NeverBounce key is entered in SAIL → AI config, stored encrypted under `CONFIG_ENC_KEY` in `system_settings.ai_router_v1`, and read by the tenant through `configuredProvider()`; the environment variable still wins where one is set. `GET/POST /api/admin/email-verification` (owner, relayed by SAIL) reports the state and verifies one address to prove a new key. The key is never returned to a browser. |
| **Listing opt-ins** (doc 15) | `lib/platform/listings.ts` + `GET/POST /api/listings` + a **Listing** tab in settings. A company's listing is projected from its latest saved profile — name, tagline, stage, sectors, location, website, founder LinkedIn, raise — and a test asserts the deck summary, thesis keywords and ARR never reach it. Both switches are audited (doc 08) and off by default. |
| **Investor activity** (doc 16) | `lib/investors/activity.ts` reads a firm's own site (same SSRF guard as deck URLs) and records `last_investment_at` **only** with the sentence and URL it came from — a quote that is not on the fetched page is refused. Daily cron `/api/cron/investor-activity`, budgeted by `ACTIVITY_DAILY_LIMIT`. Recency is 20% of evidence quality where known, and changes nothing where unknown. Shown in results as "Last seen investing …" with its source. |
| **Traction** (doc 16 §3) | Not scored, on the measurement: 11 of 17,692 firm descriptions and 3 of 47,275 investor bios state a revenue threshold (0.06%). Revisit at 5%. |
| **Learned ranker** (doc 17) | `ranker-fit.ts` (labels, logistic fit, AUC, guards — pure) and `ranker.ts` (assembly, storage, `activeWeights()`). Monthly `/api/cron/fit-ranker`, owner `GET/POST /api/admin/ranker` with a one-call rollback. Every run records which weight set ranked it in `founder_match_runs.options.weights`. **No fit is active**, and none can be until doc 17 §3 passes. |
| **A defect the ranker found** | `saveRun` has been writing `match_outcome_events.source = 'founder_match'` since matching v3, but the table's CHECK constraint from 2026-07-24 lists four sources and not that one. Every `match_shown` insert failed and was swallowed by the caller's `.catch`. Doc 17 §6 read this as "recording has just started"; it had in fact never recorded. Fixed in `2026-09-23-ranker-fit.sql`. |
