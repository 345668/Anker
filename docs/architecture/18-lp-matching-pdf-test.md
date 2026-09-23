# 18 — LP matchmaking from a fund deck alone

**Date:** 2026-09-23 · **Status:** design, then build · **Closes:** doc 14 §12's
last open item, "VC → LP matching remains broken (its tables do not match its
code)".

The same exercise as doc 09, in the other direction: take one **fund** deck as
the only input, run the VC persona's LP matchmaking, and produce a shortlist
workbook plus lists of at most 200 LPs each. The deck is a real GP's and
confidential — nothing read off it is recorded here or committed.

---

## 1. What is actually broken (measured 2026-09-23)

Both LP engines exist and both score. Neither can save a run.

| Table | Columns it has | Columns the v2 engine writes | Missing |
| --- | --- | --- | --- |
| `lp_match_sessions` | 8 | 19 | **15** — `fund_name`, `total_firms_scored`, `total_contacts_scored`, `qualified_firms`, `qualified_contacts`, `contacts_with_email`, `anchor_candidates`, `tier_counts`, `duration_ms`, `user_id`, `funnel_data`, `segment_counts`, `ai_enrichments_applied`, `duplicates_merged`, `engine_version` |
| `lp_firm_matches` | 16 | 25 | **17** — `fund_profile_id`, `firm_type`, `firm_location`, `firm_aum`, `firm_aum_usd`, `firm_sectors`, `firm_website`, `firm_linkedin`, `tags`, `reasons`, `why_this_lp`, `factor_lp_type`, `factor_aum`, `factor_geo`, `factor_thesis_signals`, `segments`, `stage` |
| `lp_contact_matches` | 13 | 25 | **17** — `fund_profile_id`, `investor_id`, `contact_type`, `contact_location`, `contact_sectors`, `tier`, `tags`, `reasons`, `why_this_lp`, `factor_lp_type`, `factor_sector`, `factor_geo`, `factor_thesis_signals`, `factor_contact_quality`, `segments`, `hnw_signals`, `stage` |

49 missing columns. Every run reaches the end of scoring and then throws on the
first insert, so a GP sees a failure after the full wait.

**Why.** `scripts/migrations/2026-04-25-matching-v2.sql` was written for exactly
this and **was never applied** — `schema_migrations` is empty; migrations on
this database have been applied by hand. That file is also not sufficient on its
own: it assumes a v1 baseline that already had `fund_profile_id`, `firm_type`,
`tags`, `reasons` and the factor columns, and production never had them. The
live tables are older than the migration's own starting point.

Two further consequences worth recording:

- `lp-matchmaking.ts` (v1) writes a **different** wrong column set, so both
  paths fail differently. v1 is the one the `/api/lp/matching/run` route still
  calls.
- `getLpSession` joins `lp_entities` — the KYC/subscription table, 0 rows,
  unrelated to the directory — so even a saved session would read back empty.

## 2. The LP universe this runs against

| Kind | Count |
| --- | --- |
| Family offices (firms) | 1,864 + 15 lower-cased |
| Asset & wealth managers | 557 |
| Sovereign wealth funds | 115 |
| Funds of funds | 32 |
| **LP-type firms, total** | **≈ 2,584** of 18,982 |
| LP-type people | ≈ 1,384 of 47,275 |
| Firms with an AUM value | 16,608 |

Enough for a real shortlist, and enough to need splitting: 2,584 firms is up to
13 files at 200 rows.

## 3. The pipeline

```
fund deck (PDF)
   │  extractPdfText → text layer, vision OCR fallback   (lib/ai/pdf.ts)
   ▼
extractFundProfile()                        (lib/ai/fund-deck-extractor.ts)
   │  name · fund number · target raise · average ticket · sectors
   │  primary sectors · geography · HQ · thesis keywords
   ▼
fundReadiness()  →  declared overrides for what the deck omits
   ▼
runLpMatchingV2()                           (lib/matching/v2/engine.ts)
   │  LP-type filter → score → min-score gate → dedup → segments → AI rationale
   ▼
saveSessionV2()   ← THIS is what the migration repairs
   ▼
buildPipelineWorkbook()   (shortlist: Summary · Firms · Contacts · Ready to Contact)
buildLpLists()            (NEW: ≤ 200 rows per file, ranks continuous across files)
```

Everything except the migration and `buildLpLists` already exists. This is a
repair plus a splitter, not a new engine.

### 3.1 The migration

One additive, idempotent migration that closes all 49 gaps, keeping the v1
columns in place — `status`, `notes`, `reasoning`, `tier_label`, `factor_stage`,
`factor_fund_size`, `factor_track_record`, `firm_match_id`, `contact_id`,
`is_decision_maker` — because other routes still read them. `stage` and
`status` will coexist; `stage` is the v2 pipeline vocabulary, `status` the v1
one, and the pipeline routes are moved to `stage`.

Nothing is dropped and no data is rewritten: all three tables are empty.

### 3.2 The list splitter

The founder side already has this (`buildGroupLists`, doc 09). The LP side gets
the same contract, so both personas export the same way:

- at most **200 rows** per file;
- rank column continuous **across** files (1–200, 201–400, …);
- last column is the stable `firm:<id>` / `contact:<id>` key, so a list can be
  re-imported into the CRM without a lookup;
- a file names its range: `… 1-200`, `… 201-400`.

## 4. What the deck must supply, and what it cannot

`fundReadiness` requires five fields: **name, target raise, at least one sector,
fund headquarters, investment geography.**

A fund deck states the first four. Investment geography is usually implied
rather than written ("we work with US universities"), so — exactly as the
founder run needed `location` — anything the deck omits is supplied as a
**declared override with its evidence**, never silently merged, and the run
reports which fields came from the deck and which did not.

## 5. Confidentiality

The deck is a GP's live fundraising document. As with doc 09: the deck is never
committed, the generated workbooks are never committed, and this document
records the engine's behaviour and counts — not the fund's terms. The
integration test reads its ground truth from a file beside the deck
(`FUND_PDF_TRUTH`), the same convention the founder test now uses.

## 6. Tests

**Unit** (no database, no provider):

- list splitting: 450 firms → 3 files of 200/200/50, ranks 1…450 continuous,
  every id exactly once, none repeated;
- readiness: a profile from extracted fields reports exactly the missing
  required fields, and an override fills one only when extraction left it empty;
- persistence shape: every column the insert names exists in the schema the
  migration creates — the defect in §1 becomes a test, so it cannot return;
- scoring invariants: an LP-type firm outscores a VC of the same description;
  a firm whose AUM cannot support the minimum commitment is not an anchor.

**Integration** (`FUND_PDF` + `FUND_PDF_TRUTH`, skipped without both): deck →
profile → run → save → read back → workbook → lists, asserting the facts a
correct extraction must get, that every saved row reads back, and that the
lists lose and repeat nothing.

## 7. Acceptance

1. A run of the Summit deck completes and **persists** — session, firms and
   contacts all readable afterwards.
2. Every result is an LP type; no VC, accelerator or corporate venture arm
   appears in the firm list.
3. The shortlist workbook has its five sheets and the lists split at 200.
4. The run reports honestly what the PDF alone could not supply.
5. Re-running is idempotent at the session level (a new session id per run; no
   partial rows left behind by a failure).

---

## 8. What the first run found (2026-09-23)

One 23-page fund deck, 35,944 characters of text layer, no overrides needed.
Scored 18,982 firms and 47,275 people in 48 s; **2,361 LP firms and 1,950 LP
contacts** qualified; 23 files written (1 shortlist + 12 firm lists + 10
contact lists). 10 unit tests and 9 end-to-end assertions pass.

### 8.1 Three more schema defects, each found only by running

§1 listed the 49 missing columns. Running the engine against the real database
found three more that no amount of reading would have shown:

| Defect | What happened |
| --- | --- |
| **Generated ids are text, the columns are uuid** | `lp_match_sessions.id`, `lp_firm_matches.id` and `lp_contact_matches.id` are `uuid` with `gen_random_uuid()` defaults and real foreign keys, but both engines generate `lms_…` / `lfm_…` / `lcm_…`. Fixed in the engine: it now generates uuids, which is what the schema was always asking for. |
| **`factor_sector` is `numeric(5,4)`** | v1 stored factors as fractions (max 9.9999); v2 scores them 0–100, so the first write overflowed. The column is now `int`, like every other factor column. |
| **`firm_id` was `uuid`, the directory's keys are not** | `investment_firms.id` and `investors.id` are `varchar`: 18,871 of 18,982 firm ids are uuid-shaped and **111 are not** (`ifm_6daa3b486b99`), likewise 289 of 47,275 investors. Because the insert is batched, one such firm would have failed the whole batch. The column now follows the directory. |

### 8.2 Extraction read the deck correctly

Name, fund number, target raise, headquarters, investment geography, sectors
and eight thesis keywords, at 0.92 confidence, with **nothing missing** — so
the declared override prepared for `geographicFocus` was never applied, which
is the override rule working: it fills gaps, it does not overwrite.

### 8.3 The ranking is plausible, and the tiers are not yet trustworthy

The top of the list is university endowments and university-affiliated
institutional investors — for a studio that commercialises university IP and
works with 200+ tech-transfer offices, that is the right answer, and the
rationales say so in the fund's own terms.

Four things are wrong enough to fix before a GP relies on this, all of them
the same defects doc 11 fixed on the founder side. **All four are now fixed —
see doc 19, which measures the before and after.**

1. **The anchor tag means nothing at this rate.** 1,553 of 2,361 firms (66%)
   are tagged `ANCHOR`. A label two thirds of the list carries is not a filter.
2. **No tie-break on evidence.** Nine firms share score 88 at the top. Founder
   v3 ranks ties by semantic fit and evidence quality (doc 11 §4.9); the LP
   scorer has no equivalent, so the order inside a tie is arbitrary.
3. **Contacts cannot reach the top tiers.** Of 1,950 contacts, **0** are
   Champions and 4 are Priority A, against 12 and 367 for firms. The contact
   path is missing the AUM factor the firm path has and nothing replaces its
   weight, so a person is capped below a firm by construction.
4. **Directory data quality shows through.** "Harvard Management Company"
   appears as a contact *name* with "Early Light Ventures" as the *title*,
   twice. The LP path has no equivalent of the founder side's normalisation
   pass.

### 8.4 Extraction is not deterministic under rate limiting

Three runs of the same deck: two extracted identically, one differed enough to
fail the target-raise assertion after Mistral returned 429 and the fallback
answered instead. The engine and the outputs were identical in all three. This
is the same fallback path doc 09 §7 recorded, and it argues for caching a
deck's extraction rather than re-reading it per run.

### 8.5 Not covered by this run

HTTP routes and authentication (the pipeline is called directly), the VC
workspace UI, and whether these are the *right* LPs — that needs a human.
