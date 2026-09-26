# 26 — User-specified matchmaking filters

**Date:** 2026-09-25 · **Status:** design → building · **Engines:** founder
(`lib/matching/v2/founder-engine.ts`) and LP (`lib/matching/v2/engine.ts`)

Requirement: before a match runs, the user picks where they will raise from and
what kind of investor they want — "only the US and Europe", "only VCs, angels and
family offices" — the way the Discover page already lets them filter the
directory. The engines must **regard those choices as user-specified constraints**
rather than hints. Both engines, because a founder choosing investors and a GP
choosing LPs are the same act against different halves of the directory.

The stated reason is automation: an agent driving this later needs to express a
mandate as data and have it obeyed deterministically. That rules out "nudge the
score and hope".

---

## 1. The vocabulary already exists — twice

Discover filters the directory on **normalised, indexed columns** that the import
pipeline already populates:

```
norm_class    InvestorClass   vc · cvc · angel · accelerator · family_office · pe ·
                              fund_of_funds · sovereign_wealth · institutional ·
                              bank · insurance · asset_manager · grant · other
norm_region   Region          north_america · europe · mea · apac · latam
norm_country  ISO code
norm_sectors  text[]          norm_stages text[]     check_min / check_max
```

`lib/matching/normalize/{classes,geo}.ts` own those vocabularies, with
`CLASS_LABELS`, `REGION_LABELS`, and the `ALLOCATOR_CLASSES` / `DIRECT_CLASSES`
split that already decides which classes each persona should even be offered.

**The matching engines use none of it.** They `SELECT … FROM investment_firms`
with no `WHERE` at all, pull all 20,654 firms and 49,452 investors into Node, and
score every one. The LP scorer then judges geography with its own second,
unrelated vocabulary — a keyword list of `utah`, `dach`, `gulf` — which doc 19
§10.5 records as the reason Texas, the Nordics and most of Asia resolve to
nothing.

So this work is less "add filters" than "use the vocabulary the platform already
has, in the one place that ignores it".

## 2. Model

One shared shape, used by both engines, both routes and the UI:

```ts
export interface MatchFilters {
  regions: Region[]           // [] = no constraint
  classes: InvestorClass[]    // [] = no constraint
  countries: string[]         // ISO codes, narrower than region
  excludeClasses: InvestorClass[]
}
```

Empty means unconstrained, never "match nothing" — an absent filter and a filter
that excludes everything must not look the same to an agent.

### 2.1 Hard constraint, not a weight

"Only raise from the US" is an instruction, not a preference. A filtered-out
record does not appear at any score. Three reasons:

1. It is what the words mean, and the user is the authority on their own mandate.
2. An agent composing a mandate needs the result to be a function of the mandate.
   A soft weight makes "only Europe" produce American LPs at rank 40, which is
   indistinguishable from a bug.
3. It is enforceable in SQL, so it is cheap and verifiable — see §3.

Scoring still runs normally *within* the filtered set: geography and capacity keep
the weights doc 19 §10 gives them, because "which of these US family offices fits
best" is still a ranking question.

### 2.2 What happens to records the directory cannot place

The trap. `norm_region` is NULL for any record whose country never resolved, and
`norm_class` is `other` for anything unclassifiable. A strict
`norm_region = ANY(regions)` silently drops them, and the user is never told that
"only North America" also discarded 4,000 records whose location was simply blank.

**Rule: a hard filter excludes unplaceable records, and the run reports how many
it excluded and why.** Excluding is right — the user asked for North America and
we cannot say these are in it — but doing so invisibly is not. The funnel already
carries per-phase counts; filters add their own line.

This is deliberately the opposite of doc 19 §10.2, where an *unplaceable* location
is not gated. The difference is who is speaking: there, the model is inferring a
mismatch and should not punish thin data; here, the user has stated a requirement
and a record that cannot be shown to meet it does not meet it.

## 3. Where it is enforced

In the SQL that loads candidates, not in Node after the fact.

```sql
FROM investment_firms t
WHERE (${classes}::text[]  IS NULL OR t.norm_class  = ANY(${classes}))
  AND (${regions}::text[]  IS NULL OR t.norm_region = ANY(${regions}))
  AND (${countries}::text[] IS NULL OR t.norm_country = ANY(${countries}))
  AND (${exclude}::text[]  IS NULL OR t.norm_class <> ALL(${exclude}))
```

Why there rather than in the scoring loop:

- **It is the same predicate Discover uses**, on the same indexed columns, so a
  filter means the same thing in both places. A user who narrows Discover to
  "Europe · family office" and then runs a match with the same filter must get a
  subset of what they just saw.
- **It fixes the load.** doc 25 §6.1 notes the engines read both tables whole;
  that is why a run takes ~130s and why it died with an `AggregateError` when the
  connection was wrong. A mandate of "US family offices" turns a 70,106-row read
  into a few thousand. The filter is the first thing that has ever bounded it.
- **It cannot be forgotten later.** A scoring-loop filter is one `continue` away
  from being skipped by a future branch.

## 4. Persistence, for the agent

The filters used are stored on the session (`lp_match_sessions.filters jsonb`,
founder runs likewise) alongside the results. Without that, a run cannot be
explained after the fact — "why is this list all European?" is unanswerable — and
an agent cannot re-run a mandate or diff two of them.

Stored as the canonical keys, not labels: `["north_america"]`, not
`["North America"]`. Labels are a rendering concern and will get translated.

## 5. UI

The matchmaking panel gains the same two controls Discover has, above the existing
score slider:

- **Geography** — multi-select over `REGION_LABELS`
- **Investor type** — multi-select over `CLASS_LABELS`, offering
  `DIRECT_CLASSES` to a founder and `ALLOCATOR_CLASSES` to a GP, because a founder
  raising a round does not raise from a sovereign wealth fund and a GP does not
  raise from an accelerator

Both default to empty — unconstrained, which is today's behaviour — so an existing
user's next run is unchanged unless they choose otherwise. After a run, the header
states the mandate in words ("North America · Europe, family office · VC") and the
excluded counts from §2.2.

## 6. Out of scope

- **Sector and stage filters.** The engines already score on sector, and the fund
  profile already states it; adding a second place to say it invites the two to
  disagree. Geography and class are different: nothing in the profile says "do not
  show me sovereign wealth funds".
- **Per-filter weighting** ("prefer Europe but allow the US"). A hard constraint
  and a scored preference are different features; building the second before the
  first has been used would guess at a need.
- **Saving mandates as named presets.** Wanted once an agent is running these, but
  it is a CRUD feature on top of this one and does not change the model.

## 7. Risks

- **A filter that returns nothing looks like a broken engine.** Mitigated by
  reporting the funnel: "12,004 excluded by geography, 8,650 by investor type, 0
  remaining" is self-explanatory in a way that an empty list is not.
- **`norm_*` coverage — measured 2026-09-25, before building on it.**

  | | `norm_class` | `norm_region` |
  | --- | --- | --- |
  | `investment_firms` (20,654) | **100%** | 93.2% — 1,410 null |
  | `investors` (49,452) | **100%** | 89.4% — 5,253 null |

  Regions land where you would expect: firms europe 8,158 / north_america 7,605 /
  apac 2,432; investors north_america 27,510 / europe 11,269 / apac 3,443. So a
  geography mandate excludes 7-11% as unplaceable, which §2.2 requires the run to
  report rather than absorb. Good enough for the feature to be honest, and
  measured rather than assumed — the mistake doc 25 §6.1 records.
- **Two geography vocabularies remain.** This work makes the engines *filter* on
  `norm_region` while the LP scorer still *scores* geography on its own keyword
  list. That is an improvement but not a resolution, and doc 19 §10.5 keeps the
  debt recorded.

---

## 8. Built (2026-09-25)

| Piece | Where |
| --- | --- |
| Shape, schema, SQL params, persona class lists, labels | `lib/matching/filters.ts` |
| Founder engine | `lib/matching/v2/founder-engine.ts` — `loadDirectory(filters)` |
| LP engine | `lib/matching/v2/engine.ts` — both load queries |
| Routes | `/api/founder/matching/run`, `/api/lp/matching/run-v2` (via `runOptionsSchema`) |
| UI | `components/tesseract/matchmaking-content.tsx` — two chip groups above the score slider |
| Tests | `lib/matching/filters.test.ts` |

Measured end to end against the live directory, same fund and same engine:

| Mandate | Qualified contacts | Top firms |
| --- | --- | --- |
| none | 1,500 | Arcadian Capital (New York), Porthcawl (San Antonio), WhitbeckBennett (Virginia) |
| `regions: [europe]` | **1,026** | Blink Impact (Amsterdam), Melnichek (Cyprus), Ariete Family Office (Barcelona), Irish Angles (Dublin) |
| `regions: [north_america], classes: [family_office]` | **591** | unchanged from the unfiltered top — correctly a subset |

The European run returns an entirely different and wholly European list, and the
class filter removes 60% of candidate contacts. The third row is the useful
check: constraining to what the top already satisfied leaves the ranking alone,
which is what "filter, then rank normally" (§2.1) should look like.

Firm counts read 250 in all three because `maxFirms: 250` caps the result, not the
candidate set; the constraint shows in the contact counts and in the changed
European list.

### 8.1 Not yet done

- **Exclusion reporting (§2.2).** The engines now exclude in SQL, but the funnel
  does not yet carry "12,004 excluded by geography, of which 1,410 had no region
  on record". Until it does, a mandate that returns little looks like a broken
  engine rather than a narrow mandate — the first risk in §7.
- **Persistence (§4).** Filters reach the engines and the run log, but are not yet
  stored on `lp_match_sessions` / founder runs, so a past run cannot be explained
  or replayed from its mandate. This is the piece the agent work depends on most.
- **Founder-side UI.** The shape, engine and route all take filters; only the LP
  matchmaking panel has the controls. `classesForPersona("founder")` already
  returns the right list for when it is added.
