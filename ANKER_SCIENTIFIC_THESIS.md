# Anker — Scientific thesis

> The principles, evidence requirements, and decision rules behind every
> scoring, matching, and extraction choice in the platform. If a feature
> conflicts with this document, the document wins and the feature is the
> bug.

## 1. The problem we model

Private capital allocation is a **search problem under heavy information
asymmetry**. Three populations sit on each side of every match:

- **Funds** raising from LPs, fund-of-funds, and family offices
- **Founders** raising from VCs, angels, and corporate venture
- **Investors and LPs** screening managers, deals, or portfolio companies

Each transaction in this market has a non-trivial qualification cost
(deck review, reference calls, data-room diligence, DDQ). The default
state is **mutual information starvation** — neither side knows enough
to qualify the other without a meeting, but a meeting itself costs more
than the expected value of any single random match.

Anker's job is to **drop the qualification cost per match** until
matches that previously weren't worth running become net-positive in
expected value. We do that by making structured, source-anchored
intelligence available before the first email.

## 2. Decision principles

These are the rules every scoring or extraction module honours. They are
boring on purpose.

### 2.1. Evidence before inference

Every non-null field returned by an extractor must be supported by a
phrase from the source document. If a field cannot be cited, it returns
null. We never paper over a missing data point with a plausible-looking
guess — the cost of a wrong fact downstream is far higher than the cost
of a missing field. The extractor prompts contain explicit rules:

> FILENAME IS NOT EVIDENCE. The document filename tells you nothing
> about content. Do not expand acronyms, infer dates, or guess the
> firm name from the filename.

> CONFIDENCE MUST REFLECT EVIDENCE. If you returned mostly nulls
> because the text is sparse or image-heavy, set confidence to 0.1–0.3.

This is enforced in `lib/ai/fund-deck-extractor.ts`,
`lib/ai/fund-deck-analyzer.ts`, `lib/ai/pitch-deck-analyzer.ts`, and
`lib/matching/v2/document-extractor.ts`. When pdf-parse yields sparse
text, we render pages to PNG and run Qwen-VL-OCR before falling back to
nulls — see `lib/ai/pdf-ocr.ts`. The OCR'd content carries a
`[source: Qwen-VL-OCR pass …]` tag so the model treats it as evidence
but at lower trust than direct PDF text.

### 2.2. Source-anchored scoring

Every numeric score (LP-fit score, investor match score, deck critique
score) is computed from a small number of explicit signals with
documented weights. We do not produce a single opaque "AI score" with
no breakdown — every result page surfaces the dimensions, the per-
dimension score, and a one-sentence justification per dimension.

The fund-deck LP critique uses six lenses with weights that change
based on whether we're looking at an emerging manager or an established
one:

| Lens | Emerging weight | Established weight |
|---|---|---|
| GP background | 1.0 × | 1.5 × |
| Sector focus | 1.4 × | 1.0 × |
| Market analysis | 1.1 × | 1.0 × |
| Thesis vs. 2025–26 trends | 1.5 × | 1.2 × |
| Fund unit economics | 1.2 × | 1.2 × |
| Claims verification | 1.4 × | 1.5 × |

The emerging-manager profile up-weights thesis and sector edge because
those are the dimensions where a new GP can plausibly outperform an
established one; the established profile up-weights track record and
claims verification because LPs allocating to a Fund V should expect
institutional reporting.

### 2.3. Claims verification is a first-class output

The fund-deck analyzer returns an explicit `claimsReviewed[]` array,
each item structured as `{ claim, category, verifiable, status,
comment }`. The categories are `track_record`, `market_size`,
`team_credential`, `portfolio_outcome`, `thesis_evidence`, `other`. The
`verifiable` field tells the LP whether the claim is `public` (we can
look it up), `private_audit` (requires DDQ or LP reference), or
`unverifiable` (it cannot be checked against any external record). The
`status` is `plausible`, `suspicious`, or `contradicted`.

This is the most important single output of the analyzer — it reduces
diligence time more than any other field. LPs prioritise calls based on
the `suspicious` rows; emerging-manager GPs use it as a pre-pitch
checklist for their own deck.

### 2.4. Confidence is honest

Confidence reflects the source quality, not the model's certainty. A
sparse image-only deck that we OCR'd successfully scores ~0.85 because
the OCR added a small layer of uncertainty over direct text extraction.
A confident-looking model output sourced from filename alone scores
0.1. The UI surfaces confidence as a numeric badge alongside the
extraction — anything below 0.5 should be reviewed by a human before
it informs an outreach decision.

### 2.5. Failover, never fallback to silence

The AI provider chain (Anthropic → OpenAI → Gemini → Qwen → Mistral)
fails over automatically on 429 / 5xx. When every provider fails, the
extractor returns a heuristic fallback marked with `confidence ≤ 0.3`
and a note explaining the failure. The UI shows the heuristic source
prominently so a user never confuses a fallback with a real
extraction.

The PDF-vision dispatcher has four independent paths so the system
keeps working even when one provider blocks a particular geo or kind of
PDF. The OCR fallback is the fifth line of defence for image-only
decks — we never refuse to read a deck because of a format.

## 3. Matching methodology

### 3.1. LP matching (fund → LPs)

The matchmaker (`lib/matching/v2/engine.ts`) scores every firm in the
database against a fund profile. The score is a linear combination of:

- **Stage and sector alignment** — does the LP's mandate match the
  fund's strategy?
- **Geography fit** — both HQ proximity and the LP's investing
  geography
- **Cheque size match** — average LP ticket vs. the fund's minimum
  commit
- **Right-sized portfolio** — LP's prior fund commitments relative to
  the fund's target raise
- **Lesser-known multiplier** — when the GP wants to avoid household-
  name LPs, we weight the long tail
- **Thesis keyword overlap** — semantic match between the fund's
  thesis and the LP's stated focus, computed via `pgvector` cosine
  similarity when both sides have embeddings

The output ranks firms into tiers (Tier 1 ≥ 9, Tier 2 ≥ 7, Tier 3 ≥
5, Tier 4 ≥ 3, Drop < 3). Tier 1 + Tier 2 typically yields 30–80 LPs
for a `$20M` emerging-manager fund-of-funds; we cap the surfaced list
at the top 200 for ergonomics.

Crucially, the score is **additive with explicit components** — every
match exposes which signal contributed how much. No black box.

### 3.2. Investor matching (founder → VCs)

The founder-side engine uses the same architecture with a different
weight profile (stage focus dominates, then sector, then geography,
then check size). It re-uses the same `score_investors` tool the
assistant exposes, so a founder running the agentic assistant gets the
same logic the dashboard uses.

### 3.3. Why no machine-learned ranker (yet)

We have ~18k firms and ~47k people in the database. A learned ranker
needs labelled match outcomes — which intros converted, which calls
booked, which closed. We collect those labels via the outreach +
pipeline tracking, but we are well below the scale where a learned
ranker outperforms the additive linear model. The plan is to revisit
this when we have ≥10k labelled outcomes across multiple funds.

Until then the linear additive scoring is the right answer because
it is **debuggable**: a GP can ask "why is this LP in Tier 1?" and the
breakdown gives an honest answer. A learned ranker that ranks the same
LP would not.

## 4. Extraction methodology

### 4.1. The four-step pipeline

Every uploaded document goes through:

1. **Text extraction** via `pdf-parse`. Returns text + page count +
   image-only-page count.
2. **Sparseness check**. If image-only pages > 50% of total OR
   extracted text < 200 characters, the document is sparse.
3. **OCR fallback** for sparse documents. `lib/ai/pdf-ocr.ts` renders
   each page to PNG via `pdfjs-dist` + `@napi-rs/canvas`, OCRs each via
   Qwen-VL-OCR, joins the result. We OCR up to 15 pages by default.
4. **Vision dispatch**. The extracted (or OCR'd) text plus optional
   inline images go to the active provider in the chain. Provider
   prompts include the page-source tag so the model knows whether the
   evidence is direct text, OCR, or none.

This pipeline is shared by every PDF-handling route:
LP matchmaking extract + analyze, find-investors deck critique,
documents page deck analysis, and the autonomous assistant's
`analyze_image` and `ocr_image` tools.

### 4.2. Why Qwen-VL-OCR specifically

We chose Qwen-VL-OCR over Tesseract and over generic vision-LLM OCR
prompts because:

- Tesseract requires a system binary that doesn't ship in Vercel's
  Lambda runtime, and its OCR quality on stylised slide text is poor.
- A generic vision LLM (Claude, GPT-4o) does OCR well but at higher
  cost per page and with no specialised OCR fine-tune.
- Qwen-VL-OCR is a free-tier model specifically tuned for OCR, runs
  through the same OpenAI-compatible endpoint as the rest of our Qwen
  stack, and produces structured-aware text (reading order preserved,
  numbers and URLs intact).

The trade-off is sequential rate limits on the free tier. A 12-page
deck takes ~72 s. Worth it for accurate extraction; we cap at 15 pages
to keep within Vercel's `maxDuration: 240` for the analyze route.

### 4.3. What we deliberately do NOT do

- We do not infer fund or founder names from filenames.
- We do not infer "Fund I" from the absence of any number — we return
  null if the deck doesn't say.
- We do not invent DPI, TVPI, or IRR numbers when no number is
  visible.
- We do not score a deck on dimensions where we cannot see the
  underlying slide.

## 5. Data quality posture

### 5.1. Ingest scripts are idempotent

Every curated dataset (`scripts/ingests/*.sql`) is idempotent: re-
running skips rows already present. Firms dedupe case-insensitively by
name; people dedupe by lowercased email, falling back to
`(firm_id, full name)` when no email is present. This means we can ask
a curator to re-export the same Folk list once a month and run the
same script — only the diff lands.

### 5.2. Cleanup is a first-class operation

`scripts/cleanup-investors-firms.sql` removes the canonical garbage
patterns we've seen accumulate from various data sources:

- Duplicate-token names ("Cynthia Ringo Ringo" — a Folk export
  artefact)
- Names with corrupt characters in the `†¥Ł€◊⊙⋆ϕψξ⊕Θ` Unicode block
- `first_name = last_name` rows with no email (Folk free-text fields)
- Exact `(name, email)` duplicates
- Empty firm names

The script is wrapped in `BEGIN / ROLLBACK` until the operator flips
the trailing line to `COMMIT`. Backups are created in the same
transaction.

### 5.3. Provenance via `source`

Every investor row carries a `source` field tagging where it came
from. Recent values include:

- `8fundraising-lp-drop-04` — 150 US family offices, curated list
- `folk-european-family-offices-founders` — 100 EU founders from Folk
- `discover-enrichment` — discovered + enriched via web crawl
- `linkedin-scrape` — scraped via the LinkedIn ingest agent

Provenance is enforced at insert time and never overwritten by
enrichment. This means a user can filter the database to "rows from
trusted curated lists" and use that as a high-precision seed for a
campaign.

## 6. Privacy and consent posture

The platform stores professional contact information for investors and
firm representatives. Everything we store:

- Public LinkedIn profiles (or LinkedIn URLs)
- Public website URLs and company emails
- Job titles and locations as reported in public bios

Personal data (private mobile numbers, home addresses, family
relationships) is **not** stored even when present in source CSVs — the
ingest scripts strip those columns before COPY.

Outreach respects standard rate limits (25 connection requests per day
on LinkedIn, 50 follow-up DMs per day, weekday-only) carried by the
platform default and enforced at the campaign engine. Every send goes
through Resend or the user's own Gmail OAuth account; we never send
"from" an address we don't control.

## 7. What changes when

This document is versioned with the codebase. Anything more than a
quarter old should be reviewed against the current implementation. The
git history of `lib/ai/*` is the ground truth — if a principle here
conflicts with what the code does, file an issue.

The next pieces of methodology we expect to add:

- **Learned ranker for LP matching** once we have ≥10k labelled
  outcomes.
- **Federated dedup** of firms across multiple ingests, using
  semantic similarity over `pgvector` embeddings.
- **Citation graph for newsroom** — every article cites sources we
  store as structured `(source, year, url)` tuples; we already extract
  the inline citations, the next step is the cross-article graph.
- **Audit-grade extraction logs** so a GP can replay exactly which
  provider, prompt, and source page produced any given extracted
  field.

When those land they get added here.

---

Last updated alongside the README and the feature integration
checklist. See `git log` on this file for the timeline.
