# 20 — Closing the two gaps the founder re-run exposed

**Date:** 2026-09-24 · **Status:** design, then build · **Follows:** doc 17 §6
(the `match_shown` CHECK defect) and doc 16 (investor activity).

Re-running the founder deck after the LP work verified the engine, and showed
two things that the engine being correct does not fix.

---

## 1. The gaps

### 1.1 A failure to record is still invisible

`saveRun` writes the run, its results, and then the `match_shown` events that
the learned ranker will one day train on. That last write ends in:

```ts
.catch((e) => console.warn("[founder-runs] match_shown not recorded:", …))
```

That is exactly how the CHECK-constraint defect survived from matching v3 until
doc 17: **every** insert failed, every failure became a console warning, and
the count stayed at zero while the platform reported healthy runs. The
constraint is fixed, but the mechanism that hid it is not. A swallowed write
will hide the next one just as well.

Telemetry must not break a matching run — that part was right. But "did not
break the run" is not the same as "nobody can tell".

### 1.2 Nothing exercises the save path outside the app

The founder end-to-end test drives extraction → engine → workbooks. It never
calls `saveRun`, so the save path — the run row, the result rows, the events —
is covered only by whatever happens in production. The LP test does persist,
because it was written after the schema defect had already cost a day.

The asymmetry is the bug: the two personas should be tested the same way.

### 1.3 Activity can only ever happen on a daily cron

`runActivitySweep` queues off `founder_match_results`: the firms a founder was
actually shown in the last 30 days. Sound design (doc 16 §2) — and it has
checked **0 of 18,982 firms**, because the queue is empty when no run has been
persisted, and the only trigger is a cron nobody can invoke.

So the "last seen investing" column stays blank, and recency contributes
nothing to any score.

## 2. The fixes

### 2.1 `saveRun` returns a receipt

```ts
export interface RunReceipt {
  runId: string
  groups: number
  independents: number
  /** How many match_shown events were recorded — and why not, when none were. */
  shown: { recorded: number; failed: string | null }
}
```

The write stays non-fatal, and the failure becomes **visible in three places**:
the receipt the caller gets, a `console.error` rather than a warning, and the
run's own `totals.shownRecorded`, so a run that recorded nothing says so in the
row it writes about itself.

### 2.2 The founder test persists, the same way the LP test does

Gated on `FOUNDER_PERSIST_SCOPE=<orgId>:<userId>` so the default run stays
read-only, and asserting what the LP test asserts: the run reads back, the
result rows match the engine's counts, and the `match_shown` events exist with
`source = 'founder_match'`.

### 2.3 The constraint defect becomes a regression test

Against PGlite, not production: build `match_outcome_events` with the **old**
CHECK, prove `saveRun` still saves the run and reports `shown.failed`; apply
the migration, prove the events land. The defect cannot come back silently.

### 2.4 Activity runs on demand, not only at 03:45

`POST /api/admin/investor-activity` (owner-gated, like the email-verification
route in doc 13 §6): runs a bounded sweep now and reports what it checked,
what it dated and what it could not reach. `GET` reports coverage — how many
firms are checked, how many carry a date, how old the oldest check is.

The sweep keeps its budget, its 90-day re-check window and its evidence rule
(doc 16 §2). This adds a trigger, not a new policy.

## 3. What this does not change

- Recording stays best-effort: a telemetry failure still never fails a run.
- Activity stays demand-driven — the firms a founder was shown, not the
  directory. Enriching 19,000 firms speculatively is still the wrong trade
  (doc 16 §2).
- The ranker stays inert until its guards pass (doc 17 §3); more events change
  when it *could* activate, not whether it is allowed to.

## 4. Tests

- `saveRun` returns the number of events recorded, and on the old schema
  reports the failure instead of swallowing it, while still saving the run.
- The coverage report counts checked, dated and stale firms.
- A sweep with an explicit id list checks exactly those firms and respects the
  daily budget.

---

## 5. What shipped, and what it found (2026-09-24)

`saveRun` returns a receipt; the founder end-to-end test persists when
`FOUNDER_PERSIST_SCOPE` is set; `POST /api/admin/investor-activity` runs the
sweep on demand and `GET` reports coverage; five PGlite tests cover both halves
of the recording defect. Suite 582 passing, build clean.

Run against the real deck and database, in a throwaway workspace since deleted:

| | |
| --- | --- |
| Run persisted | 9,239 firm groups, 10,000 independents |
| **`match_shown` events recorded** | **200 — the first ever written** |
| Receipt | `shown: { recorded: 200, failed: null }` |
| Activity sweep | 25 firms checked, **2** published a dated investment with evidence, 23 checked with nothing datable |

The sweep's 8% hit rate is the evidence rule working, not failing: a firm whose
site carries no dated, quotable investment is marked checked and given no date.

### 5.1 A third gap: extraction varies enough to change the shortlist

Two runs of the same deck, minutes apart, both with the semantic layer
available, read the company's sectors differently:

| Run | Sectors read | Top-200 sports/health share | Largest tie |
| --- | --- | --- | --- |
| First | sports technology, healthtech, ai, **saaS** | **99%** | 2 |
| Second | sports technology, healthtech, ai, **enterprise software** | **88.5%** | 9 |

> **This diagnosis was wrong — corrected in doc 21 §1.** Both sector lists
> normalise to the same canonical groups (`sports, healthcare, saas, ai`),
> differing only in order, and the scorer reads groups rather than labels, so
> the wording changed nothing. What actually varied is the model-written prose
> — `oneLiner`, `description`, `thesisKeywords`, `pitchDeckSummary` — which is
> what the semantic query vector is built from. The engine did not change; what
> it was asked to match changed, but through the embedding, not the sectors.

Two fixes, both built in doc 21:

1. **Cache a deck's extraction** by content hash, so re-running a deck gives
   the founder the same profile and the same shortlist. Doc 18 §8.4 reached the
   same conclusion from the LP side.
2. **Constrain extraction to the canonical sector vocabulary**
   (`lib/matching/normalize/sectors.ts`), so the model picks from the taxonomy
   the scorer actually uses rather than inventing an adjacent label.

Until then the acceptance thresholds in doc 11 §8.1 hold only for a profile
that reads the deck narrowly, and a failure there should be read as "check what
was extracted" before "check the engine".
