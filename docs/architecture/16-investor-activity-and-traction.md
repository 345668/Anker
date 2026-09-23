# 16 — Investor activity, and why traction is not scored

**Date:** 2026-09-23 · **Status:** design, then build · **Closes:** doc 10 L5
(recency) and L9 (traction fit), left unbuilt in doc 14 §12 for want of data.

---

## 1. What the data actually holds (measured 2026-09-23)

| Signal | Coverage | Usable? |
| --- | --- | --- |
| `investment_firms.last_funding_date` | **0 of 18,982** | No |
| `investors.recent_investments` | 70 of 47,275, and the contents are categories, not events — `["Startups"]`, `["Startups, PE Funds"]` | No |
| `market_signals` | 600 rows, `source = "derived"` — restatements of fields we already hold ("X is active in Technology"), not observations | No |
| `investment_signals` | 0 rows | No |
| `last_enrichment_date` | 17,479 firms — when *we* looked, not when *they* invested | Only as freshness |
| Firm descriptions naming a revenue threshold | **11 of 17,692** (0.06%); investor bios: 3 | No |

Two conclusions, and they differ:

- **Activity is missing but obtainable.** Investors publish their recent
  investments; nothing has ever fetched them.
- **Traction thresholds are missing because investors do not state them.**
  0.06% coverage cannot move a ranking; extracting them would be work whose
  output nothing could use.

## 2. Activity: capture it for the investors a founder actually sees

Enriching 19,000 firms speculatively is expensive and mostly wasted. The
investors that matter are the ones at the top of a run.

```
matching run finishes
   │  top N firm groups (default 200)
   ▼
activity queue: firms whose activity_checked_at is null or older than 90 days
   │  daily cron, budgeted (ACTIVITY_DAILY_LIMIT, default 200)
   ▼
lib/investors/activity.ts
   fetch the firm's site (safe-fetch, same SSRF guard as deck URLs)
   → portfolio / news / blog pages via the existing crawler
   → extract dated investment events with the configured model
   ▼
investment_firms.last_investment_at, last_investment_note,
                 activity_source_url, activity_checked_at
```

- **Evidence or nothing.** A date is written only with the sentence and URL it
  came from; anything undated is ignored.
- **The same safety rules as deck URLs** (doc 14 §8): https only, private
  ranges refused, redirects re-checked, size and time capped.
- **Cost is bounded** by the daily limit and the 90-day re-check window.

### 2.1 How it scores (doc 11 §4.7)

Activity does **not** get a new weight — the seven weights were argued and
sum to 100. It folds into **evidence quality** (4 points), which becomes
"evidence and activity":

Where activity is known, **one fifth** of evidence quality comes from
recency and four fifths from the records as before
(`0.8 · records + 0.2 · recency`):

| Firm's last investment | recency |
| --- | --- |
| within 6 months | 1.00 |
| 6–18 months | 0.66 |
| 18–24 months | 0.33 |
| older than 24 months | 0 |
| **never checked** | component unchanged — an unchecked firm is never punished |

So the model is unchanged for every investor whose activity is unknown, and
prefers the demonstrably active one between two otherwise equal firms. The
result carries `lastInvestmentAt` so the UI can show "last seen investing
…" with its source link.

## 3. Traction: collected, shown, not scored

`arr`, `mrr`, `growthRateMom`, `teamSize` and named customers stay in the
profile and are used where they help:

- in the **AI rationale** prompt, so the sentence can say why the company is
  ready for this investor;
- in the **workbook summary** and the deck-critique context;
- **not** in the score, because 0.06% of investors state a threshold to score
  against. Inventing thresholds per stage would be our opinion dressed up as
  the investor's criterion.

**Revisit when** the share of investors with a stated threshold exceeds 5%
(a measurement, not a guess): the scorer then gains a traction gate — an
investor whose stated minimum the company misses is capped, the way the
off-thesis gate works today.

## 4. Tests

- The extractor takes only dated events, with the quoting sentence and URL.
- A firm whose page has no dates is marked checked, with no date written.
- Quality scoring: unknown activity scores exactly as before; recent activity
  scores above stale activity; the 4-point weight is unchanged.
- The daily budget is honoured across processes.

## 5. What shipped (2026-09-23)

`lib/investors/activity.ts` (fetch + extract + write), pure banding in
`lib/matching/normalize/recency.ts`, the daily cron at
`/api/cron/investor-activity` (`45 3 * * *`), and eight tests. Results carry
`lastInvestmentAt`, `lastInvestmentNote` and `lastInvestmentSource`; the match
list shows "Last seen investing …" and the expanded breakdown links the page
the date was read from. Nothing is written for a firm whose site is
unreachable, and a quote the model produced that is not on the fetched page is
refused — the test for that is the one that matters.
