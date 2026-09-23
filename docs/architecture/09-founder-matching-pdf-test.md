# 09 — Founder matching, driven by a PDF alone

**Date:** 2026-09-22 · **Status:** design, then build · **Tests:** the founder
→ investor matchmaking engine and its input/output chain

The requirement: take one founder pitch deck as the **only** input, run it
through the real extraction and matching pipeline, and produce (a) a shortlist
workbook and (b) the full ranked result as Excel lists of at most 200
investors each — and use that same path as a test of the engine.

First run: a real pre-seed deck (14 pages, a print-to-PDF of a web page).
The deck is confidential, so nothing read off it is recorded here — the
company is "the test deck" throughout and its terms are not reproduced.

---

## 1. The chain under test

```
PDF bytes
  │  extractPdfText()                       lib/ai/pdf.ts            deterministic
  ▼
page text
  │  extractStartupProfile()                lib/matching/v2/document-extractor.ts
  │    vision chain = mistral (forced in admin config) → qwen      lib/ai/pdf-vision.ts
  │    → analyzePdfDocuments(): first provider that answers        non-deterministic
  │    → on failure: heuristicFallback()                           deterministic
  │    (corrected after the first run — see §6)
  ▼
ExtractedProfileFields
  │  startupSchema / startupReadiness()     lib/matching/profile-readiness.ts
  ▼
StartupProfile  ──► runFounderMatching()    lib/matching/v2/founder-engine.ts
                        18,982 firms · 47,275 people                real DB
  ▼
FounderMatchingResult
  │  buildFounderWorkbook()                 lib/matching/v2/founder-xlsx.ts   (shortlist)
  │  chunkInvestors() + buildInvestorListWorkbook()                   (≤200 lists)
  ▼
.xlsx files
```

Everything is the production code path except the HTTP layer. The routes
(`/api/founder/extract-profile`, `/matching/run`, `/export`) are thin wrappers
that add authentication and session caching; they are not exercised, and the
session is not cached, because caching requires a real workspace to own it.

## 2. A finding before anything runs

`startupSchema` requires `location` (non-empty). **The test deck states no
location** — no city, no country of incorporation. The prompt tells the model
"do NOT guess", which is right.

So a strictly PDF-only run *must* stop at readiness with
`missingFields: [location]`. That is correct behaviour and the test asserts
it. A PDF-only pipeline is therefore not fully automatic for any deck that
omits location, and in the product the founder fills it in.

To still produce a match, the harness supplies location as a **declared,
evidence-backed override** — the deck's own market statement names US
organisations as its market, which gives "United States" — recorded in the
output as an input the PDF did not provide. It is never silently merged into
the extracted profile.

## 3. Outputs

| File | Content |
| --- | --- |
| `…shortlist.xlsx` | The engine's own 6-sheet workbook (Summary, Lead Candidates, Firm Groups, Independent Investors, Ready to Email, Import Selection) — exactly what the product exports. |
| `…firm-groups-01-of-50 (ranks 1-200).xlsx` … | Every **firm group** the engine returns — the firm, its primary contact and alternates — ranked, 200 per file; rank is global across files. |
| `…independents-01-of-50 (ranks 1-200).xlsx` … | Every **independent investor** (no firm in the directory), same layout. |
| `…run-manifest.json` | The extracted profile, the overrides, counts, and what was and was not verified. |

Firms and people are separate series rather than one mixed list: they are
different entities with different columns, and a mixed sheet cannot be
imported into the CRM, which expects one kind per import.

Written outside the repository. The deck and its results are the company's
confidential material and do not belong in version control.

## 4. The two test layers

**Unit (always runs, no DB, no AI):** `pdf-pipeline.test.ts`
- chunking: every file ≤ 200; the union of chunks equals the input exactly —
  nothing lost, nothing duplicated, rank order preserved across file
  boundaries;
- boundary sizes: 0, 1, 200, 201, 400, 401;
- list workbooks: headers present, row count matches, rank column continuous.

**Integration (gated on `FOUNDER_PDF`, needs the DB and the AI provider):**
`pdf-pipeline.integration.test.ts`
- *input*: PDF text is extracted from most pages; the facts on the page reach
  the text (the ask, `pre-seed`, the company name);
- *extraction*: name, stage, ask are correct against ground truth read from the
  deck by hand; location is **not invented**;
- *readiness*: a PDF-only profile reports exactly `location` missing;
- *engine*: results exist; scores sorted descending; no duplicate ids; every
  score ≥ the minimum; tiers consistent with scores;
- *output*: shortlist has the product's sheets; lists obey §4 unit invariants
  against the real result.

Ground truth (read from the deck, not from any model):

| Field | Value | Source |
| --- | --- | --- |
| name | the company | every page |
| stage | pre-seed | p.1 |
| askAmount | the stated ask | p.13 |
| instrument | SAFE with a post-money cap | p.13 |
| location | **not stated** | — |

## 5. Known limitations, stated up front

- **Extraction is non-deterministic.** Assertions are on facts a correct
  extraction must get (stage, ask, name), not on exact wording.
- **The heuristic fallback cannot parse an `$NMM` ask.** Its regex accepts
  `M|K|million|thousand` followed by a word boundary; "MM" fails both. If the AI
  path fails, the ask is lost. Recorded, not fixed here.
- **Some slide text is cut off at the right margin** ("PERFORMANC…") because
  the deck is a print of a web page; extraction quality reflects that honestly.

---

## 6. What the first run found (2026-09-22)

The first run stopped at readiness: `name`, `sectors` and `askAmount` came
back empty. The diagram in §1 was wrong in two places, and the failure was
three defects stacked on each other.

**6.1 The platform does not read PDF text at all.** `extractPdfText()`
returned 0 characters and reported all 14 pages as image-only. The deck
actually has a full text layer: 9,132 characters, 55–197 words on every
page, and the raise line readable on p.13.
Commit `c5cc4b8` (2026-06-05, "switch text extraction to pdf-lib") replaced
`pdf-parse` with `pdf-lib`, which can count pages but cannot read text; the
function has hardcoded `wordsPerPage = 0` for every PDF since. Text was then
only recoverable through the Marker sidecar (`MARKER_URL`, default
`127.0.0.1:8001`), which is not configured, and cannot be reached from a
serverless function. **Every PDF uploaded since June has been treated as a
scan**, sent to OCR or to native vision, or reduced to nothing.

**6.2 Preparation was decided by the lead provider only.** In
`analyzePdfDocuments`, OCR is skipped when the first provider in the chain
reads PDFs natively. The chain here was Mistral → Qwen (the admin config
forces `providerOverride: mistral`). Mistral's OCR returned 429 and its chat
model returned 403 ("not available in your subscription tier"), so the chain
fell through to Qwen — which received empty text and a note telling it to
"read the attached PDF pages", pages Qwen is never sent. It answered with
nulls, correctly.

**6.3 The Mistral key in the admin config cannot use the configured model.**
Recorded for the owner; not a code defect.

### 6.4 Design of the fixes

```
PDF bytes
  │  extractPdfText()
  │    1. text layer via pdfjs-dist getTextContent()      NEW — deterministic, no canvas
  │         (on failure: pdf-lib page count, as before — never worse than today)
  │    2. image-heavy AND Marker reachable → Marker        unchanged
  ▼
PdfText { text, wordsPerPage, imageOnlyPages, source: "pdfjs" | "pdf-lib" | "marker" }
  │
  │  analyzePdfDocuments(chain)
  │    for each provider p in chain:
  │      docs = prepared[native(p)] ??= prepareDocs(docs, native(p))   NEW — per kind, memoised
  │        native     + sparse → text + "read the attached pages" note
  │        non-native + sparse → Qwen-VL-OCR text                       (was: skipped if lead native)
  │        either     + text   → the text layer
  │      call p; on error fall through
  ▼
provider text → JSON → ExtractedProfileFields
```

- **Text layer.** `pdfjs-dist` is already a dependency, already listed in
  `serverExternalPackages`, and already loaded at runtime by `pdf-ocr.ts` on
  the same deployment. Text extraction needs no canvas, so it has none of the
  native-binary risk the OCR path has. The buffer is copied before it is
  handed to pdfjs, which may detach the array it is given.
- **Per-kind preparation.** At most two preparations per call (native,
  non-native), each at most once; a provider with no usable key is skipped
  before any preparation, so it can never trigger an OCR pass.
- **Unchanged:** the provider order, `providerOverride`, the prompts, Marker.

### 6.5 Tests added

- `lib/ai/pdf-vision.test.ts` — native lead fails → Qwen receives OCR text and
  never the native-only note; native lead succeeds → no OCR; one preparation
  per kind; no OCR for a keyless provider. Three of the four fail on the old
  code.
- `lib/ai/pdf.test.ts` — a generated PDF with a known sentence comes back
  with that sentence, a non-zero word count per page and `source: "pdfjs"`;
  a PDF with a blank page counts that page as image-only; bytes that are not
  a PDF degrade to the old result instead of throwing.
- The integration test's input assertion now holds the text layer to the
  deck's real content (> 8,000 characters, 0 image-only pages, the facts on
  p.1 and p.13 present) instead of asserting the defect away.

---

## 7. Second run — results (2026-09-22)

Integration test: **11/11 pass.** Unit suite: 397 pass, 11 skipped (this
test, without `FOUNDER_PDF`).

| Stage | Result |
| --- | --- |
| Text layer | 14 pages, 9,052 chars via pdfjs, 0 image-only pages |
| Extraction | Mistral 429/403 → fell through to Qwen on the text layer. Name, stage (pre-seed), ask, pre-money (derived from the cap less the ask), sectors (sports technology, healthtech, SaaS, AI) and primary sector all correct · confidence 0.85 |
| Location | Not in the deck, correctly left empty; supplied as the declared override "United States" |
| Engine | 18,982 firms / 47,275 people scanned; 3,591 duplicates merged; 54.6 s |
| Result | 10,000 firms, 10,000 people (**capped** — see 7.1); 2,194 contacts with email |
| Output | 1 shortlist (6 sheets, 38 MB) + 50 firm lists + 50 people lists, ≤ 200 rows each, every investor exactly once, ranks continuous — verified by reading the files back from disk |

### 7.1 What the run says about the engine

**The 10,000 cap truncates inside a tier.** `runFounderMatching` sorts and
keeps the top `maxFirms`/`maxContacts` (default 10,000 each,
`founder-engine.ts:183`). Firms were cut inside Priority A (2,119 Champion +
7,881 Priority A, 0 below); people inside Priority B. The totals report
`qualifiedFirms: 10000`, which is the post-cap count, not the number that
qualified.

**The Champion tier is inflated, and sector focus does not separate ranks.**
Measured over the written firm lists:

| Ranks | Score | Sports/health sector | US-based | Pre-seed/seed | Generic "why" |
| --- | --- | --- | --- | --- | --- |
| 1–50 | 88–93 | 44% | 74% | 100% | 82% |
| 51–200 | 88 | 44% | 73% | 100% | 98% |
| 201–1,000 | 85–88 | 45% | 72% | 100% | 98% |
| 1,001–2,119 | 80–85 | 48% | 27% | 100% | 100% |
| 2,120–5,000 | 75–79 | 40% | 58% | 100% | 100% |
| 5,001–10,000 | 64–75 | 39% | 35% | 100% | 100% |

Stage fit is satisfied at every rank, so it does not discriminate; sports/
health focus is flat at ~40–48% from rank 1 to rank 10,000. Cause, from the
weights in `founder-scoring.ts`: any pre-seed VC collects ≈ 60 points from
stage (25) + check size (20 — nearly every pre-seed fund covers a $1M round)
+ investor type (12–15). The extracted sectors include the horizontal tags
"AI" and "SaaS", which almost every generalist fund lists, so sector adds
8–18 more without any sports focus. The thesis keywords extraction produced
("authoring layer", "Flex multi-agent AI", …) are too specific to match
investor text. Result: a London climate fund and a Berlin XR fund rank as
Champions at 82 with the reason "Lead-check capacity at stage."

Scores also clump — 150 firms tie at 88 — so within a tie the lists fall back
to alphabetical order (the deterministic tiebreak in `rankInvestors`).

**Not changed here** (scoring weights are a product decision). Options, for
the owner: treat horizontal sectors (AI, SaaS, software, technology) as
weaker than vertical ones; require a primary-sector or vertical match for
Champion; weight geography more when the founder's region is known; widen
score resolution so ties are rare.

**AI rationales:** 50/50 applied. The router fell through Mistral's 429s to
another provider. Rationales are specific for the top matches but not
verified — one Amsterdam fund's rationale claims a "U.S." fit.

### 7.2 Still not verified

- HTTP routes, authentication and session caching (the pipeline is called
  directly).
- Whether these are the *right* investors — needs a human reading the top of
  the list.


---

## 8. Third run — engine v3 (2026-09-23)

Same deck, same harness, the rebuilt engine (docs/architecture/11). **16/16
tests pass**, including the acceptance checks in doc 11 §8.

| | v2 (§7) | v3 |
| --- | --- | --- |
| Sports/health share, ranks 1–50 | 44% | **100%** |
| Sports/health share, top 200 | 44% | **99%** |
| Sports/health share, last band | 39% | **16%** |
| Champions | 2,119 | **187** |
| Largest tie in the top 200 | 150 (score 88) | **2** (full ranking key) |
| Non-US firms scored as US | 1,648 across the directory | **0** |
| Thesis matching | sector tags only (semantic dead) | tags **+ semantic**, all ~66k vectors |
| Result shape | 10,000 firms + 10,000 people, unrelated | **10,000 firm groups** (each with a primary contact and up to two alternates) + 12,919 independents |
| Qualified before the cap | not reported | 11,267 groups · 19,533 independents |
| Top of the list | 776, Tapestry VC (AI/consumer), CourtsideVC | VisionTech, CourtsideVC, Sports Colab, Athletic Ventures, AAF Management |

Files written to `~/Downloads/<company> investor matches/v3 (engine founder-v3)/`:
the 6-sheet shortlist, 50 firm-group lists and 50 independent lists of ≤200,
and the run manifest (101 workbooks + manifest).

**Still true of this deck:** it states no location, so the run continues to
use the declared, evidence-backed override (§2). **Still not verified:** the
match *quality* beyond the measurements above — whether these are the right
investors needs a human reading the top of the list.
