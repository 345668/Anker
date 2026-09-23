# 10 — Founder → investor matching and Discover: gap analysis and target design

**Date:** 2026-09-22 · **Status:** analysis and design — nothing built yet ·
**Evidence:** the test-deck run (doc 09), a read of every file on the path, read-only
measurements against the production database, and a probe of the database
driver. Each finding is marked **measured** (a query or a run showed it) or
**read** (the code says so and nothing contradicts it).

---

## 0. The short version

1. **P0 — `sql.unsafe()` returns no rows on Neon.** 21 call sites. Discover
   crashes; the semantic matching layer is empty; LP and VC match actions return
   404; portfolio and data-room lists are empty. One line is the root cause:
   `lib/db/index.ts:69`. *(measured)*
2. **P0 — The semantic layer is off twice over.** The app embeds at 768
   dimensions, the vector columns hold 1,024. It is also caught by (1). The only
   factor that can tell a sports-tech thesis from a generic one — worth up to 18
   of 136 points — scores 0 for every investor. *(measured)*
3. **P1 — Scoring rewards generic fit.** Any pre-seed VC collects ~60 points
   before sector is considered; "AI" and "SaaS" count as sector fit; 170 people
   from one firm can all make the list; "Email verified" is a format check.
   *(measured)*
4. **P1 — The export → re-import round trip fails at real scale.** A real run
   exports 38 MB; import accepts 10 MB; and the import sheet pre-ticks all
   20,000 investors. *(measured)*
5. **P2 — The founder cannot steer or read the result in the app.** The UI
   sends 2 of the engine's inputs; the results view shows the top 10 firms and
   nothing else; nothing is saved between visits. *(read)*

---

## 1. How the the test deck test was run — and where it went wrong

### 1.1 The approach

One PDF was the only input. A harness (`lib/matching/v2/pdf-pipeline.ts`)
called the **production** functions in order — PDF text → profile extraction
→ readiness → `runFounderMatching` → the product's workbook — with no
re-implementation, so any defect found is a product defect. Ground truth was
read from the deck by hand before any model ran. Tests asserted the facts a
correct extraction must get and the engine's structural invariants. Outputs
were read back from disk.

### 1.2 What held up

- Composing production code directly. It found three real platform defects
  (no PDF text since June; preparation decided by the lead provider only; the
  semantic layer off) that a mocked test would have hidden.
- Declared overrides with evidence, kept apart from the extracted profile, and
  a separate PDF-only readiness report. The deck has no location, and the
  output says so rather than inventing one.
- Measuring when a number looked wrong: the exact 10,000, the 2,119 Champions,
  the flat sector share across bands.

### 1.3 Where it went wrong

- **The first diagnosis blamed the input.** `extractPdfText` returned 0
  characters and I concluded "the deck is image-only", then wrote that into the
  test and doc 09. A second tool (pdfjs directly) showed 9,132 characters and
  the real defect. *Rule taken: measure the input with an independent tool
  before blaming it.*
- **It built on a wrong configuration reading.** Doc 09's first diagram said
  "provider = qwen (only DASHSCOPE key)" — from the assistant audit's misread of
  a `text` column as an object. Corrected in both documents.
- **The semantic layer was off in both runs, and I missed it.** The log line
  `[embeddings] dim mismatch: got 1024, need 768 — dropping` was in the run
  output; my log filter dropped it. The integration test has no assertion that
  semantic scoring ran, so nothing failed.
- **I propagated a mislabel.** My people lists have an "Email verified" column
  fed by `emailVerified`, which is a regex format check
  (`founder-scoring.ts:240`), not verification. The product makes the same
  claim in the funnel ("With verified email"), the KPI ("Ready to email —
  verified email") and the "Ready to Email" sheet.
- **The relevance check could not fail.** It tested that top firms invest at
  pre-seed/seed. Every result in every band does (100%), so it proved nothing
  about ranking. The structural invariants (score floor, no duplicates, tier
  matches score) all passed while the ranking was weak.
- **What the harness bypassed:** HTTP routes and auth; the 4 MiB upload cap
  (the test deck is 4,056,449 bytes — 96.7% of it); the session cache insert of a
  20,000-entity result; the UI, which sends only `{ startup, minScore }`; and
  the export → re-import round trip.
- **Cost.** `enableAi` defaults on: 50 rationale calls, each paying Mistral's
  429 retries (49 logged) before falling through to Qwen.

### 1.4 What the test must add (see §9, B8)

An assertion that the semantic layer resolved similarities; a relevance check
that *can* fail (vertical-sector share must fall with rank); the HTTP path with
upload limits; the export → import round trip at full size.

---

## 2. The chain today, with each defect placed

```
UPLOAD  ≤5 files, ≤4 MiB total, PDF/TXT/MD/CSV/JSON only        (I7)
  │
  ▼
extractPdfText()  ── fixed 2026-09-22 (pdfjs text layer) ─────────────────────
  │
  ▼
extractStartupProfile()  vision chain: mistral (forced) → qwen
  │   extracts pitchDeckSummary, founderBios …
  ▼
startupSchema (zod)  ── strips unknown keys: pitchDeckSummary, founderBios,
  │                     geographyTargetRegions never reach the engine    (D8)
  ▼
runFounderMatching()
  ├─ SELECT * firms (18,982) + people (47,275) — full scan per run
  ├─ semanticScoresFor() ── embed 768 vs column 1024 → null             (D2)
  │                      ── sql.unsafe → [] on Neon                     (D1)
  │                      ── no embedding_model guard                    (D3)
  ├─ score: stage 25 + check 20 + type 15 ≈ 60 baseline                 (L1, L2)
  │         people check size read from a 0.5%-populated column         (D4)
  ├─ dedup → sort → slice(10,000)  — cut inside a tier                  (D6)
  ├─ no firm grouping — up to 170 people per firm                       (L3)
  └─ AI rationales for the top 50
  ▼
cacheSession()  one JSONB row, 24 h
  ▼
UI: KPIs, tier chart, segments, top 10 firms                            (O1)
export: 6-sheet xlsx (38 MB), methodology, outreach plan
  ▼
import-shortlist  ≤10 MB, Import Selection pre-ticked TRUE              (D7)
```

---

## 3. Defects — things that exist and are wrong

| ID | Sev | Defect | Evidence |
| --- | --- | --- | --- |
| **D1** | P0 | `sql.unsafe()` returns `[]` on Neon. `lib/db` prefers `driver.unsafe` when it exists; Neon's driver (v1) has one, but it builds a raw-SQL *fragment* (`UnsafeRawSql`), not a query. June's fix (`73b0d2d`) assumed Neon had no `.unsafe`. 21 call sites in 10 files return no rows without an error: Discover, both semantic layers (matching and the assistant's search), the VC/LP match loader (`lib/matching/access.ts`), the LP pipeline-stage route, portfolio companies, the data room, newsroom, and two admin counters. Separately, `updateStartup` (`lib/db/platform-queries.ts:256`) pastes values into SQL text — injection-shaped — and has no callers: delete it rather than fix it. | *measured:* `neon(url).unsafe(...)` → `UnsafeRawSql`, not a promise; `.query(...)` → rows. `searchDiscovery` against the production DB → `TypeError: reading 'total'`. `lib/newsroom/queries.ts:110` records the same symptom in production logs and works around it locally. |
| **D2** | P0 | Embedding dimension. `EMBEDDING_DIM` defaults to 768 (`lib/ai/embeddings.ts:33`); `investment_firms.embedding` and `investors.embedding` are `vector(1024)`, all 66,257 rows embedded with `mistral-embed`. The startup's 1,024-d vector is dropped, so semantic = 0 everywhere `EMBED_DIM` is unset. `.env.local` does not set it; production not inspected. | *measured:* column types; the run log line. |
| **D3** | P1 | No model guard on similarity. `semantic.ts` compares against any stored embedding; `fitDim` checks length only. Switch the provider to Qwen and startup vectors (Qwen) are compared with investor vectors (Mistral) — numbers that look valid and mean nothing. | *read:* `semantic.ts:68,78` |
| **D4** | P1 | People's check size is read from `investors.typical_check_size` — populated for **248 of 47,275**. `typical_investment` ("$50K-$250K") is populated for **41,791** and never read. The check-size factor (20 points) is 0 for 99.5% of people. | *measured* |
| **D5** | P1 | "Email verified" is `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`. No verification exists. | *read:* `founder-scoring.ts:240` |
| **D6** | P1 | The 10,000 cap per kind cuts inside a tier (firms inside Priority A); `totals.qualifiedFirms` reports the post-cap count; the schema forbids asking for more. | *measured* (doc 09 §7.1) |
| **D7** | P1 | Round trip. The export's Import Selection sheet sets every investor to TRUE (`founder-xlsx.ts:81`) — importing unedited creates 20,000 CRM entries. And a real export (38 MB) is above the import limit (10 MB, `import-shortlist/route.ts:18`), so it cannot be re-imported at all. | *measured:* the test deck shortlist 38,149,912 bytes; Import Selection 20,004 rows |
| **D8** | P1 | Fields dropped by the schema. `startupSchema` (zod, strips unknown keys) has no `pitchDeckSummary`, `founderBios` or `geographyTargetRegions`. The first is the richest text the semantic layer embeds; the last is read by `scoreGeoFit`, whose "target region" branch is therefore unreachable. | *measured:* the test deck extracted 13 fields, 11 reached matching |
| **D9** | P2 | Scale drift. Tiers are absolute (Champion ≥ 80) on a 136-point scale; the file header says "Max ≈ 118" (`founder-scoring.ts:13`). With semantic off, every score is up to 18 lower, so a tier means different things depending on whether embeddings worked. The UI slider runs 10–60. | *read* |
| **D10** | P2 | Founder matching never records `match_shown`. `match_outcome_events` holds 217 events, all from outreach (152 contacted, 65 replied); none can be tied to a match. | *measured* |
| **D11** | P2 | UI copy says the workbook has "5 sheets"; it has 6. The top 20 contacts are returned and never rendered. | *read:* `find-investors-content.tsx:699` |
| **D12** | P2 | The heuristic fallback cannot parse an `$NMM` ask (doc 09 §5). | *read* |

---

## 4. Missing logic steps in the engine

| ID | Missing step | Why it matters (the test deck evidence) | Data available? |
| --- | --- | --- | --- |
| **L1** | **Sector specificity.** Horizontal tags (AI, SaaS, software, technology, B2B) should count for less than vertical ones (sports tech, healthtech). | Sports/health share is 39–48% in *every* band from rank 1 to 10,000. | Yes — a curated horizontal list. |
| **L2** | **A Champion gate.** Champion should require a vertical/primary-sector match or strong semantic similarity, not only a high sum. | 2,119 Champions; ranks 1,001–2,119 are 27% US, with a London climate fund at 82. | Yes. |
| **L3** | **Firm grouping.** Rank firms; attach each firm's best 1–3 people; score unattached people separately. | 14,357 people are linked to 4,960 firms, up to 170 at one firm. Nothing stops a list from emailing ten partners of one fund. | Yes — `investors.firm_id`. |
| **L4** | **Exclusions.** Already in the founder's CRM; contacted or passed before; do-not-contact; investors in a competitor. | None exist. Every run re-suggests investors the founder already declined. | CRM: yes. Competitor portfolios: no (only `portfolio_count`). |
| **L5** | **Activity / recency.** Prefer investors who invested recently. | `last_funding_date` is empty for all firms; `recent_investments` has 70 rows. | **No** — needs enrichment. |
| **L6** | **Lead logic.** "Lead candidate" is inferred from check size alone. The round's own lead status (lead secured? needs a lead?) is not an input. | the test deck needs a lead for its SAFE; 7,712 "lead candidates" is not a useful filter. | Partly — `num_lead_investments` for 633 people. |
| **L7** | **Geography depth.** People's country is read from free-text `location`; `investor_country` (41,358 populated) is unused. Target regions are unreachable (D8). | Non-US funds reached Champion on stage + check + type. | Yes. |
| **L8** | **Score resolution.** 150 firms tie at 88; ties fall to alphabetical order. Continuous components (similarity, distance from the ideal check) would break ties on merit. | Ranks 51–200 of the the test deck list are alphabetical. | Yes, once D2 is fixed. |
| **L9** | **Traction fit.** ARR, MRR, growth and team size are collected and never scored. | Collected for nothing. | **No** investor-side thresholds in the data. |
| **L10** | **A persisted, reproducible run.** Profile version + engine version + options + results, so a run can be reopened, compared and audited. | `founder_match_sessions` is one JSONB blob, 24 h, and had 0 rows when read. | — |
| **L11** | **Learning from outcomes.** Emit `match_shown`; demote declined investors; later, a ranker (the LP side has one in `v2/scoring.ts`). | D10. | Once D10 is fixed. |

Stage vocabulary was checked and is **not** a significant gap: only 9 firms
and 1 person list stages the scorer does not recognise at all.

---

## 5. Input options

| Input | Extracted from deck | In the UI form | Survives the schema | Scored |
| --- | --- | --- | --- | --- |
| Name, one-liner, description | ✓ | ✓ | ✓ | semantic only |
| Sectors, primary sector | ✓ | ✓ | ✓ | ✓ |
| Stage | ✓ | ✓ | ✓ | ✓ |
| Location | ✓ | ✓ | ✓ | ✓ |
| Round size, pre-money, ideal check min/max | ✓ | ✓ | ✓ | ask + checks |
| ARR, MRR, growth, team, founded | ✓ | ✓ | ✓ | ✗ (L9) |
| Thesis keywords | ✓ | ✓ | ✓ | ✓ |
| Deck summary, founder bios | ✓ | ✗ | **✗ stripped** | ✗ |
| Target regions | ✗ | ✗ | **✗ stripped** | reachable only in code |
| Run options: max results, AI rationales | — | ✗ | ✓ | ✓ (API only) |

**Missing inputs**

- **Round terms:** instrument (SAFE / priced / note), valuation cap and
  whether it is pre- or post-money. The test deck's post-money cap became
  "pre-money $5MM" — arithmetically right, and the instrument is lost.
- **Round status:** lead secured or needed; amount committed / soft-circled;
  target close date.
- **Targeting:** regions to raise from; investor types wanted or excluded (VC,
  angel, CVC, family office); named firms or people to exclude; "already in
  conversation".
- **Company context:** business model (B2B / B2C / B2B2C), customer segment,
  named customers, use of funds, competitors (for conflict checks).
- **Weights or presets:** the retired "balanced / industry-first /
  stage-first / local…" presets (`app/dashboard/discover/actions.ts`) show the
  intent existed; nothing replaces them.
- **Deck formats and sources:** PPTX, Keynote, DOCX and Google Slides are
  refused ("export to PDF first"); there is no URL input — the test deck is a
  print of a hosted pitch page, and DocSend / Pitch links are the common case. The
  4 MiB total cap is below many real decks.
- **Persistence:** the extracted and edited profile is never saved. Every visit
  re-extracts or starts from the workspace defaults; there is no field-level
  provenance (deck / typed / override).

---

## 6. Output options

**Exists:** in-app KPIs, tier chart, segment table, top 10 firms; a 6-sheet
xlsx; methodology and 4-week outreach plan (Markdown or Word); xlsx re-import
into the CRM; a WebMCP tool an agent can call to add one result to a board.
**Built for the test deck, not wired to the product:** Excel lists of ≤ 200 with global
rank (`buildInvestorLists`), and a run manifest.

**Missing outputs**

| ID | Output | Note |
| --- | --- | --- |
| O1 | **A result browser in the app** — filter, sort and page over the full result | Today: top 10 firms; 20 contacts returned and not shown. |
| O2 | **Row actions** — save to CRM, exclude, mark "already talking" | Today only through the xlsx round trip or the agent tool. |
| O3 | **Batched export** — ZIP of ≤ 200-row lists, firms and people separate | The functions exist in `pdf-pipeline.ts`. |
| O4 | **CSV** | Most CRMs and sequencers import CSV, not xlsx. |
| O5 | **Firm-grouped view** — firm, then its best people | Depends on L3. |
| O6 | **Per-match explanation** — the factor breakdown, not just the sum | `factors` is computed for every entity and never shown. |
| O7 | **Run history and comparison** | Depends on L10. |
| O8 | **Provenance report** — which fields came from the deck, which were typed or supplied | The the test deck manifest is a prototype. |
| O9 | **Direct hand-off to outreach** — a sequence or LinkedIn list from a selection | Must keep the approval gate: nothing auto-sends. |
| O10 | **Honest labels** — "Has email" until verification exists | D5. |

---

## 7. The Discover page

**What it is.** `/dashboard/discover`, for founder and VC workspaces. The
server renders the first 100 investors and 100 firms through
`searchDiscovery`; the client pages through `/api/investors` and
`/api/firms`. Filters: search, stage, type, country, sector, check size, has
email, has LinkedIn. Table or grid; select and bulk-add; add one investor to
the CRM; an owner-only enrichment menu; a "Prepare matching" link.

### 7.1 Broken now

- **DS1 — P0. It does not load.** `searchDiscovery` → `sql.unsafe` → `[]` →
  `TypeError` (D1). The server render fails and the API routes answer 503
  "Could not load records". *Measured against the production database with the
  app's driver; that production uses the Neon driver is inferred from the URL
  switch in `lib/db/index.ts` and the newsroom log note.*

### 7.2 Broken once DS1 is fixed (measured with a working driver)

| ID | Sev | Problem | Measured |
| --- | --- | --- | --- |
| DS2 | P1 | **Slow.** Facet lists are rebuilt from the whole table on every request (`discovery.ts:72`). | 40 s for the first investor page; 11–16 s filtered; 11 s firms. |
| DS3 | P1 | **Ships every column to the browser**, including private ones: `to_jsonb(t)` (`discovery.ts:64`). | 52 fields per investor: the 1,024-number embedding, phone, address, `user_id`, `metadata`, Folk custom fields, enrichment status. 1.46 MB per 100 rows, also embedded in the server-rendered page. |
| DS4 | P1 | **Check-size filter returns 0 investors** — people have no `check_size_min/max` (D4). | `check=$500K-$1M` → investors 0, firms 11,092. |
| DS5 | P2 | **Facets are raw strings.** | "Countries": 1,845 values ("-", "AB", "Aarberg"…); sectors 2,460 (people) / 7,811 (firms); stages 79 / 95. |
| DS6 | P2 | **Alphabetical order only.** No relevance, no fit. | — |
| DS7 | P2 | **Firms cannot be saved to the CRM** — only investor rows have Add. | *read* |
| DS8 | P2 | **Saves are mislabelled** as `founder_matching` / `lp_matching` though they came from Discover (`lib/crm/discovery.ts:16`) — polluting outcome attribution. | *read* |
| DS9 | P2 | **Bulk add is one server action per investor, in sequence** (`discover-content.tsx:261`). | *read* |
| DS10 | P3 | **Placeholders and dead code:** "URL check — Not available yet" (lines 798, 1014); `totalMatches: 0` hard-coded; `actions.ts` keeps nine retired stubs and a reader for a `matching_algorithms` table. | *read* |

### 7.3 Missing

- **Fit to my round.** Score each row against the founder's saved profile with
  the same scorer, and sort by it. Discover and Find Investors are two
  unconnected tools over the same data.
- **Semantic search.** All 66,257 rows are embedded; search is `ILIKE`.
  "Sports performance analytics" should find investors whose theses say so in
  other words.
- **Normalised facets:** country from `investor_country` or parsed location;
  canonical sectors and stages.
- **CRM awareness:** show which rows are already in the CRM and their stage;
  hide or exclude them on request.
- **Firm ↔ people navigation:** a firm with its people; a person with their firm.
- **Saved searches and alerts; export a selection** (CSV, ≤ 200 per file).
- **Data freshness / completeness** per row, so founders know what is stale.
- **Persona fit (decision):** a VC sees the same investor directory, but the
  directory a fund needs is LPs and co-investors; LPs have no Discover.

---

## 8. Target design

```
INPUT
  DeckSource: PDF · PPTX/DOCX→PDF · URL (DocSend/Pitch/web)   ≤ 20 MB via blob upload
    │  text layer (pdfjs) → OCR / native vision when sparse
    ▼
  extraction with per-field evidence
    ▼
  startup_profiles  (org, version, fields, provenance per field: deck|typed|override)
    │  schema carries: round terms, lead status, target regions, investor-type
    │  wants/excludes, exclusions, deck summary, founder bios
    ▼
MATCHING  (engine v3)
  candidates  = SQL prefilter (stage/type/geo) ∪ semantic top-K   ── guard: same embedding_model
  score       = vertical/horizontal sectors · stage · check (firms: min/max,
                people: typical_investment) · geography (country + targets) ·
                type · thesis · semantic (continuous)
  gates       = Champion needs vertical sector or strong semantic
  exclusions  = CRM (contacted/passed) · do-not-contact · named excludes
  group       = firm + best 1–3 people; unattached people separately
  rank        = score, then continuous tiebreak (similarity, check distance)
    ▼
  founder_match_runs (profile_version, engine_version, options, totals)
  founder_match_results (run_id, kind, entity_id, firm_id, rank, score, tier,
                         factors, reasons) ── paged + filtered in SQL
  match_outcome_events ← match_shown for what the founder saw
    ▼
OUTPUT
  result browser (server-paged) · row actions (save / exclude)
  exports: shortlist xlsx (Import Selection default FALSE, or top-N TRUE)
           · ZIP of ≤200-row lists · CSV · provenance manifest
  import: size limit ≥ export size, or import by run id instead of file

DISCOVER
  explicit column projection (no embeddings, no private fields)
  discovery_facets materialised nightly (normalised country/sector/stage)
  fit score vs the saved profile · semantic search · firm save · source = "discover"
```

**Data model additions**

| Table | Purpose |
| --- | --- |
| `startup_profiles` | Versioned founder profile with per-field provenance. |
| `founder_match_runs` | One row per run: profile version, engine version, options, totals. |
| `founder_match_results` | One row per result; indexed on `(run_id, rank)` and filter columns. Replaces the single JSONB blob so results can be paged, filtered and kept. |
| `discovery_facets` | `(kind, facet, value, count)`, refreshed on a schedule. |

---

## 9. Build order

Each step lists what proves it done.

| # | Step | Proves it | Risk |
| --- | --- | --- | --- |
| **B1** | `lib/db`: use `driver.query` when it exists, `.unsafe` only for PGlite. | Unit test with a Neon-shaped fake (both methods; `unsafe` returns a non-array) returns rows. Discover query returns rows against the DB. | **High reach:** 21 call sites start returning real rows. The LP pipeline-stage `UPDATE` (`app/api/lp/pipeline/stage/route.ts:61`) has never executed in production. Review each site before shipping; do not bundle with anything else. |
| **B2** | Embedding dimension from the column (or `EMBED_DIM=1024`), and similarity restricted to the current `embedding_model`. | the test deck integration test asserts `semantic.enabled` and that some results carry semantic points. | Low. |
| **B3** | Discover: explicit projection; materialised facets; people check size from `typical_investment`; firm save; `source = "discover"`. | Page ≤ 100 KB per 100 rows; first page < 1 s; check filter returns people; no private fields in the payload (test). | Low. |
| **B4** | Scoring v3: L1, L2, L3, L7, L8 and D4, D8 in the engine. **Needs the owner's decision on weights (§10).** | Re-run The test deck: vertical-sector share falls monotonically with rank; Champions bounded; ≤ 3 people per firm. | Changes every founder's results. |
| **B5** | Output: Import Selection default FALSE (or top 200 TRUE); import by run id; ZIP of ≤ 200 lists and CSV on the export route; result browser; "Has email" label. | Export → import round trip of the full test-deck run passes as a test. | Low. |
| **B6** | Input: persisted profile with provenance; schema adds the fields in §5; UI sends `enableAi`, `maxFirms`, target regions; URL and PPTX sources; blob upload for large decks. | the test deck through the HTTP route end to end, including the upload. | Medium (upload path). |
| **B7** | Runs and results tables; `match_shown`; exclude declined / contacted. | A run reopens after 24 h; a declined investor does not reappear. | Medium (migration). |
| **B8** | Test hardening from §1.4. | The the test deck integration test fails on today's code for D2 and for the flat sector share. | None. |

B1 and B2 are defects with no product decision in them and can go first. B4
waits for §10.

---

## 10. Decisions for the owner

1. **Scoring weights (B4).** Recommended: horizontal sectors at half weight;
   Champion requires a vertical/primary match or semantic ≥ 0.6; at most 3
   people per firm; geography up to 20 when the founder names target regions.
2. **Result size.** Keep 10,000 per kind, or return grouped firms (e.g. top
   2,000 firms with up to 3 people each) — fewer, better, and inside the
   import limit.
3. **Emails.** Rename to "Has email" now, or add a verification provider.
4. **Discover's audience.** Should founders see investors' phone numbers and
   addresses at all? And what should VC and LP workspaces discover?
5. **Import model.** Import by run id (no file) instead of re-uploading the
   workbook.

## 11. Not verified

- That production's `DATABASE_URL` selects the Neon driver (inferred: URL
  switch in `lib/db/index.ts`, the newsroom log note, the Neon URL in
  `.env.local`).
- Production's `EMBED_DIM` (Vercel env not inspected).
- Whether `founder_match_sessions` has 0 rows because no founder has finished
  a run or because a ~tens-of-MB insert fails; the size was not measured.
- The Discover and Find Investors pages in a browser (the browser pane was not
  open, and the pages need a signed-in session).
