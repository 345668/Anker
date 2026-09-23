# 17 — The learned ranker: from expert weights to fitted ones

**Date:** 2026-09-23 · **Status:** design, then build · **Closes:** doc 10 L11,
deferred in doc 14 §12 ("fitting weights to replies needs outcomes that do not
exist yet"). This builds the machinery and the guard; it will not change a
single score until the outcomes justify it.

---

## 1. Where the labels come from

The white paper's weights (doc 11 §4.1) are expert-set and say so. Runs now
record what a founder was shown, so the platform can start learning which of
those matches actually worked.

```
founder_match_runs / founder_match_results     what we ranked, with components
match_outcome_events  match_shown              what the founder saw (top 200)
crm_entries.stage     contacted → responded → meeting → committed / passed
outreach_messages     sent, replied, bounced
```

A labelled example is **one shown investor the founder acted on**:

| Label | Condition |
| --- | --- |
| **positive (1)** | contacted **and** the investor replied, met, went to diligence or committed |
| **negative (0)** | contacted, and 21 days later still no reply, or explicitly passed |
| *excluded* | never contacted — silence about an investor nobody approached says nothing about the ranking |

Excluding un-contacted rows matters: the founder contacts the top of the list,
so counting the rest as negatives would teach the model that its own ranking
was wrong.

## 2. The model

Features are the seven components the scorer already records per result
(`payload.components`), each in [0, 1], plus the bias. The fit is a logistic
regression (L2, gradient descent, ~200 iterations) — small, inspectable, and
directly comparable to the expert weights because it lives in the same space.

```
p(worked) = σ( b + Σ wᵢ · componentᵢ )
```

Fitted weights are rescaled to sum to 100 so a score stays a 0–100 number and
the tiers keep their meaning.

## 3. The guard — when fitted weights are allowed to win

A fit replaces the expert weights only when **all** hold:

1. **≥ 200 labelled examples**, of which **≥ 50 positive** and **≥ 50 negative**;
2. examples come from **≥ 5 distinct workspaces** (one company's taste is not the platform's);
3. on a held-out 30% split, the fitted weights beat the expert weights by
   **≥ 0.03 AUC**;
4. no component weight is negative after rescaling — a negative weight means
   the data is telling us something we do not understand yet, and it goes to
   a human instead of into production.

Otherwise the expert weights stay and the report says which condition failed.

## 4. Storage and use

`matching_weight_history` already exists (weights, previous_weights,
trigger_type, signal_counts, is_active) and is reused:

- a fit writes one row: the weights, the previous active set, the counts, the
  held-out AUCs, `is_active` only when §3 passes;
- `activeWeights()` returns the active fitted set or the expert defaults;
- every run records which it used, in `founder_match_runs.options.weights`
  (`"expert"` or `"fitted:<id>"`), so any result can be explained later;
- one row can be deactivated to roll straight back.

## 5. Running it

| Path | Purpose |
| --- | --- |
| `GET /api/cron/fit-ranker` (monthly, `CRON_SECRET`) | assemble labels, fit, evaluate, write the row |
| `GET /api/admin/ranker` (owner) | the current state: label counts, the last fit, its AUCs, which guard failed, the active weights |
| `POST /api/admin/ranker { activate: false }` (owner) | roll back to the expert weights |

## 6. What this does today

Today the report reads **"not enough data: 0 of 200"** and every run keeps the
expert weights. That is the honest state, and the machinery is what turns the
accumulating outcomes into a decision rather than a guess.

**Why there were 0 events — a defect, not a young feature.** Writing this
design turned up the reason the count was zero. `saveRun` records the top 200
groups with `source = 'founder_match'`, but the CHECK constraint on
`match_outcome_events` (migration 2026-07-24) permits four sources and not that
one. Every insert failed, and the caller's `.catch` turned the failure into a
console warning. Nothing was ever recorded. `2026-09-23-ranker-fit.sql` widens
the constraint; from the next run onwards the events accumulate as intended.

Note that the labels do **not** depend on that log: assembly reads
`founder_match_results` (what was shown, with its components) joined to the
founder's own CRM rows, and uses `match_outcome_events` only to catch a reply
recorded against a person rather than a firm. The fix restores a signal, it
does not unblock the ranker.

## 6a. What shipped

| Piece | Where |
| --- | --- |
| Labels, logistic fit, AUC, deterministic split, the four guards | `lib/matching/v2/ranker-fit.ts` (pure) |
| Assembly from runs + CRM + outcomes, storage, `activeWeights()`, rollback, state | `lib/matching/v2/ranker.ts` |
| Weights as a scorer argument, defaulting to the expert set | `founder-scoring.ts` `scoreInvestor(f, ctx, sSem, w)` |
| Which set ranked a run | `founder_match_runs.options.weights` = `"expert"` or `"fitted:<id>"` |
| Monthly fit | `GET /api/cron/fit-ranker` (`CRON_SECRET`, `0 4 1 * *`) |
| Owner view, manual fit, rollback | `GET /api/admin/ranker`, `POST { fit: true }`, `POST { activate: false }` |
| Tests | `ranker-fit.test.ts` (17), `ranker.test.ts` (11, against PGlite) |

Two guards are worth calling out because they fired during development: a
synthetic set where noise ran against the label produced a **better** AUC than
the expert weights and a negative `thesis` weight — and was refused, exactly as
§3 intends. A stored weight set that does not sum to 100 is also ignored at
read time, because it would move every score against fixed tier thresholds.

## 7. Tests

- Label assembly: a contacted-and-replied result is positive; contacted and
  silent for 21 days is negative; never contacted is excluded.
- The fit recovers known weights from synthetic data (a component that
  perfectly predicts the label gets the largest weight).
- Each guard blocks activation on its own; the report names the one that failed.
- `activeWeights()` falls back to the expert weights when nothing is active,
  and a run records which set it used.
