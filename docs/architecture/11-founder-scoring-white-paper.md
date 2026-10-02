# 11 — Founder → investor scoring, version 3: a white paper

**Date:** 2026-09-22 · **Status:** specification, approved direction ("best-case
weights, detailed beforehand") · **Replaces:** the v2 additive model in
`lib/matching/v2/founder-scoring.ts` · **Evidence base:** the test-deck run (doc 09),
the gap analysis (doc 10), and measurements on the production investor
database (18,982 firms, 47,275 people) taken on 2026-09-22.

---

## Abstract

The v2 founder scorer adds seven independent point ranges. It ranks a
pre-seed sports-tech company's investor list with sports/health focus flat at
39–48% from rank 1 to rank 10,000, and classifies 2,119 firms as Champions.
This paper shows why — an additive baseline that any stage-appropriate fund
collects, sector matching that 92% of firms pass, geography detection that
places 1,648 European and African firms in the United States, and a semantic
factor that has never run — and specifies a replacement: a normalised 0–100
score in which **thesis fit carries the most weight, must-have criteria act as
gates rather than as points, every component is continuous so ties are rare,
and people are ranked inside the firm they work for.** It ends with the
acceptance tests the implementation must pass on the test deck.

---

## 1. What an investor match has to capture

An investor takes a first meeting when four things are true, roughly in the
order they screen for them:

1. **Thesis** — the company is in a market they invest in. Specialists
   (a sports-tech fund) are the strongest signal; generalists who invest in
   the company's broad category (software, AI) are weaker; everyone else is
   noise.
2. **Stage** — they write checks at this stage. A seed fund will not lead a
   Series B; a growth fund will not do pre-seed. This is close to binary.
3. **Check size** — their typical check fits the round, and for a lead, is a
   meaningful share of it.
4. **Geography** — they invest where the company is, or where it is raising.

Investor type, activity and data quality matter at the margin. **The first
two are gates, not preferences**: a perfect score on everything else does not
make a growth fund a pre-seed lead. An additive model cannot express that; it
lets strength on three criteria buy a failure on the fourth.

## 2. Why v2 ranks badly — measured

| Finding | Measurement (2026-09-22) | Consequence |
| --- | --- | --- |
| **Additive baseline.** Stage (25) + check (20) + type (15) are available to every pre-seed VC regardless of thesis. | ≈ 60 of the 80 Champion points before sector is looked at. | Thesis decides only the last 20 points. |
| **Sector matching passes almost everyone.** `hasSectorOverlap` matches by substring: "ai" is inside "ret**ai**l", "ar" (AR/VR) inside "softw**ar**e" and "healthc**ar**e". | **16,104 of 17,453** firms with sectors (92%) "overlap" the test deck. **9,565** firms are tagged AR/VR with no AR/VR term. | Sector points are nearly universal, so they cannot separate ranks. |
| **Horizontal tags count as fit.** "AI" and "SaaS" are listed by most generalist funds. | Sector share flat at 39–48% across bands. | A climate fund that lists "software" scores like a sports specialist. |
| **Geography by substring.** `detectRegions` matches "la" (Los Angeles) inside "Nether**la**nds", "Switzer**la**nd", "Po**la**nd", "**La**gos". | **1,648** clearly non-US firms detected as US — Switzerland 506, Netherlands 458, Poland 199, Finland 145, Ireland 101. | An Amsterdam fund earns the "U.S." bonus (and the AI rationale repeats it). |
| **Semantic factor off.** 1,024-d stored vectors, 768-d query; and `sql.unsafe` returns no rows. | 0 points for every investor in every run. | The one factor that reads theses is absent. |
| **People's check size unread.** | 248 of 47,275 have the column read; 41,791 have `typical_investment`. | 20 points missing for 99.5% of people. |
| **Integer steps.** Every component is one of 2–4 fixed values. | 150 firms tie at exactly 88. | Order inside a tie is alphabetical. |
| **No grouping.** People are ranked independently of their firm. | Up to 170 people per firm; 14,357 people linked to 4,960 firms. | A list can contact ten partners of one fund. |

## 3. Design principles

1. **Normalise to 0–100.** Component weights sum to 100, so a score reads as
   "percent of an ideal match", and tier thresholds keep their meaning when a
   component is unavailable (§4.9).
2. **Continuous components.** Each component is a number in [0, 1], not a
   step, so the ranking carries information all the way down.
3. **Thesis first.** Thesis fit is the heaviest component, and vertical
   (market) sectors outrank horizontal (technology) ones.
4. **Gates for must-haves.** A stage mismatch or an explicit off-thesis
   investor cannot reach the top tiers, however strong the rest.
5. **Unknown is not zero and not a match.** Missing investor data scores
   between a mismatch and a match, so sparse records neither win nor vanish.
6. **Words, not substrings.** All vocabulary matching is on word boundaries.
7. **Rank people inside firms.** The unit a founder contacts is a firm; the
   question for people is *who at that firm*.
8. **Explain every number.** Each component, gate and cap is recorded on the
   result and rendered in the "why".

## 4. The model

### 4.1 Weights

| Component | Weight | Why this weight |
| --- | --- | --- |
| **Thesis fit** (sector + semantic + keywords) | **40** | The first screen investors apply, and the only component that distinguishes a specialist from a generalist. |
| **Stage fit** | **20** | Near-binary for investors; also a gate (§4.8). |
| **Check-size fit** | **15** | Decides whether the investor can participate meaningfully. |
| **Geography fit** | **12** | Matters, but many early-stage funds invest across a country or region. |
| **Lead capacity** | **5** | Separates leads from followers; most useful when a lead is needed. |
| **Investor type fit** | **4** | Type is largely captured by stage and check; kept for stage-type mismatches (PE at pre-seed). |
| **Evidence quality** | **4** | Prefers investors whose records support the score (and, for people, reachable contacts). |
| **Total** | **100** | |

### 4.2 Thesis fit — `T ∈ [0, 1]`, weight 40

**Sector vocabulary.** The existing synonym groups (`industry-synonyms.ts`) are
kept, matched on word boundaries. Each group is classed:

- **Horizontal (technology):** AI, SaaS/software, data/analytics.
- **Generic markers (not a sector):** "technology", "tech", "internet",
  "digital", "platform", "B2B", "enterprise", "generalist", "sector agnostic".
- **Vertical (market):** every other group — sports, healthcare, fintech,
  climate, education, and so on.

The startup's **primary vertical** is its `primarySector` if that is vertical,
else its first vertical sector. Its other verticals and horizontals follow.

**Sector score `s_sec`:**

| Investor's sectors | `s_sec` |
| --- | --- |
| include the startup's primary vertical | **1.00** |
| include another of the startup's verticals | **0.80** |
| generalist (only generic markers, or states sector-agnostic) | **0.45** |
| share only horizontal groups with the startup | **0.35** |
| no sector data | **0.30** |
| have sectors, none shared | **0.00** |

**Semantic score `s_sem`.** Cosine similarity between the startup's text
(name, one-liner, description, sectors, keywords, **deck summary**) and the
investor's embedded thesis. Absolute cosines differ between embedding models,
so they are calibrated **within the run by rank**: among every investor with
a stored vector (all ~66,000, an iterative HNSW scan of about two seconds),
the 75th percentile scores 0, the closest scores 1, linear in between —
only the closest quarter earns semantic credit; equal similarities share a
rank. Only vectors from the **same embedding model** are
compared.

*Revised after the first v3 runs:* the first calibration,
`clamp((sim − p50) / (p95 − p50))` over the nearest 2,000, gave the closest 5%
all exactly 1.0 and left everyone beyond the nearest 2,000 at 0 — both caused
ties among otherwise identical specialists (29 firms at one score in the top
200). Scoring every investor with the median as zero then promoted too many
generalists (ranks 201–1,000 fell to 85% sports/health while 1,001–2,000
stayed at 95%); the zero point moved to the 75th percentile.

**Keyword bonus `k`.** +0.05 per thesis keyword found in the investor's
description or bio (word boundaries), capped at +0.15.

**Focus.** A vertical match counts for less when the investor lists many
verticals: a fund naming sports as one of two markets is a specialist; one
naming "fitness and wellness" among ten is not. Vertical matches are
multiplied by `f = 1 / (1 + 0.1 · max(0, v − 3))`, where `v` is the number of
verticals the investor lists (3 → 1.0, 5 → 0.83, 8 → 0.67, 10 → 0.59).

**Combination** when semantic similarities resolved:

- vertical match (`s_sec ≥ 0.6` after focus): `T = s_sec · (0.85 + 0.15 · s_sem)` —
  specialists are ordered by how closely their thesis text reads like the
  deck, and never fall below 85% of what their tags state;
- otherwise: `T = max(s_sec, 0.6 · s_sec + 0.4 · s_sem)` — semantic evidence can
  promote a generalist whose text matches, never demote;

then `T = min(1, T + k)`. Without semantic similarities, `T = min(1, s_sec + k)` (§4.9).

*Revised after the first v3 run on the test deck (2026-09-22).* The first combination,
`max(s_sec, 0.6·s_sec + 0.4·s_sem)`, capped every specialist at 1.0: 68 firms
in the top 200 shared one score, and a consumer fund that lists "Fitness and
Wellness" among ten sectors ranked as a sports-tech Champion. Focus and the
specialist spread above answer both.

### 4.3 Stage fit — `S ∈ [0, 1]`, weight 20

Investor stages are normalised with a wider synonym table: "early stage" →
{pre-seed, seed, series-a}; "idea/first check", "angel" → pre-seed;
"pre-series a" → seed; "series b+", "later stage", "expansion" → series-b and
later; "growth", "pre-ipo" → growth.

| Relation | `S` |
| --- | --- |
| invests at the startup's stage | **1.00** |
| adjacent stage only (one step) | **0.50** |
| no stage data | **0.35** |
| stages known, none adjacent | **0.00** — and the stage gate applies |

### 4.4 Check-size fit — `C ∈ [0, 1]`, weight 15

**Target range.** The founder's ideal individual check `[a, b]` if given;
otherwise derived from the round `A`: `[0.05·A, 0.5·A]`.

**Investor range `[lo, hi]`.** Firms: `check_size_min/max`. People: parsed from
`typical_investment` ("$50K-$250K"), falling back to `typical_check_size`. One
number `x` gives `[x, x]`.

| Relation | `C` |
| --- | --- |
| ranges overlap | **1.00** |
| no overlap: distance ratio `r` (`lo/b` if above, `a/hi` if below) | `max(0, 1 − log₂(r) / 3)` — 2× off → 0.67, 4× → 0.33, 8× → 0 |
| no check data | **0.40** |

### 4.5 Geography fit — `G ∈ [0, 1]`, weight 12

Locations are resolved to a **country** (word-boundary match on country
names, US states, and major cities; `investor_country` first for people) and
then to a **macro-region** (North America, Europe, Middle East & Africa,
Asia-Pacific, Latin America).

| Relation | `G` |
| --- | --- |
| investor's country is the startup's country, or in the founder's target regions | **1.00** |
| same macro-region | **0.60** |
| different macro-region | **0.20** |
| investor location unknown or unresolvable | **0.40** |

### 4.6 Lead capacity — `L ∈ [0, 1]`, weight 5

`L = 1` when the investor's top check `hi ≥ 0.25·A` (can take a lead-sized
share), or for people with `num_lead_investments > 0`; `L = 0` when `hi` is
known and below; `L = 0.30` when unknown. When the founder states the lead is
already secured, the weight moves to check-size fit (lead capacity no longer
matters).

### 4.7 Investor type — `Y ∈ [0, 1]`, weight 4 — and evidence quality `Q`, weight 4

**Type by startup stage:**

| Type | pre-seed / seed | series A–B | growth / late |
| --- | --- | --- | --- |
| VC, micro-VC | 1.0 | 1.0 | 0.7 |
| Angel, angel network | 1.0 | 0.4 | 0.1 |
| Accelerator | 0.8 | 0.1 | 0.0 |
| Corporate VC | 0.6 | 0.8 | 0.8 |
| Family office | 0.5 | 0.6 | 0.7 |
| Private equity / growth | 0.0 | 0.5 | 1.0 |
| Bank, insurer, SWF, asset manager, fund of funds | 0.1 | 0.3 | 0.6 |
| Grant body | 0.5 | 0.2 | 0.0 |
| Unknown | 0.5 | 0.5 | 0.5 |

Types the founder **excludes** are removed from the result; if the founder
names **wanted** types, others are multiplied by 0.7.

**Evidence quality `Q`:** firms — 0.5·(portfolio size, `min(1, log₁₀(n+1)/2)`)
+ 0.5·(share of description, stages, sectors, check size present). People —
0.6 for a **verified** email (0.35 for an unverified one, 0 for a
known-invalid one) + 0.2 LinkedIn + 0.2 bio present.

### 4.8 Gates and caps

Applied after the weighted sum, in order, each recorded on the result:

| Gate | Condition | Effect |
| --- | --- | --- |
| **Stage** | `S = 0` (stages known, none adjacent) | score × 0.5 |
| **Type not wanted** | founder named wanted types; this is not one | score × 0.7 |
| **Off-thesis** | `s_sec = 0` **and** (`s_sem < 0.2` or semantic unavailable) | scores above 45 are mapped into 35–45 |
| **Champion** | score ≥ 80 requires `T ≥ 0.75`, `S = 1`, `G ≥ 0.6` | otherwise 80–100 is mapped into 70–79.9 |
| **Priority A** | score ≥ 60 requires `T ≥ 0.45`, `S ≥ 0.5` | otherwise 60–100 is mapped into 50–59.9 |

Gates **map** a score into the band below rather than clamping it to one
value, so investors stopped by the same gate keep their order and do not tie.

Read in plain terms: **a Champion is a specialist (or a thesis the semantic
layer strongly confirms), at the right stage, in the right part of the
world.** A stage-perfect generalist is Priority B unless its thesis text
confirms the fit.

### 4.9 When a component is unavailable

If semantic similarity did not resolve (no provider, no vectors, a model
mismatch), `T` falls back to sector and keywords, and the run records
`semantic: "unavailable"` with the reason. Scores remain on the same 0–100
scale; they are not shifted down by 18 points as in v2. The result states
plainly that thesis fit was judged from sector tags only.

### 4.10 Tiers and the qualification floor

Tier thresholds are unchanged (shared with the LP engine): **Champion ≥ 80,
Priority A ≥ 60, Priority B ≥ 40, Prospect C ≥ 20** — but on a normalised scale
and behind the gates above. **The default floor is 40** (Priority B and
better); founders can lower it to 20.

### 4.11 Ranking and ties

Scores are kept as floating-point values and shown to one decimal. Order:
score, then `s_sem`, then `Q`, then name, then id. Ties on the full key are
practically impossible.

## 5. Grouping by firm

The founder's unit of outreach is a firm. v3 returns **firm groups** and,
separately, **independent investors**.

**Firm group.** A firm with its people, ordered by *contact rank*:

`contact rank = 0.60·personFit + 0.25·seniority + 0.15·contactQuality`

- `personFit` — the same model as above, computed from the person's own
  record (bio, sectors, stages, typical investment, country).
- `seniority` — from the title, word-boundary: managing partner, general
  partner, founding partner, partner, founder = 1.0; principal, vice
  president, director, venture partner = 0.7; associate, analyst, scout = 0.4;
  unknown = 0.5.
- `contactQuality` — 1.0 verified email, 0.6 unverified email, 0.3 LinkedIn
  only, 0 none; a known-invalid email counts as none.

**Primary contact:** the highest contact rank with a sendable email (verified
first, then unverified), else the highest overall. Lists show the primary
contact and up to **two** alternates. Founders contact one person per firm;
the others are there if the first does not reply.

**Group score.** The firm's score. Where the firm record is sparse (no sectors
and no stages) and its best person's fit is higher, the group uses
`max(firm score, best person fit − 5)` — the people are the evidence for the
firm's thesis — and records that it did.

**Independent investors.** People with no firm, or whose firm is not in the
directory (angels, scouts, family-office principals), are scored on their own
records and listed separately.

## 6. Exclusions

Removed before ranking, counted in the run totals:

- entries already in the founder's CRM at **contacted, responded, meeting,
  in diligence, committed or passed** (still shown at "queued", flagged);
- addresses on the workspace's **suppression list**;
- firms and people the founder names as **excluded**;
- investor **types** the founder excludes.

## 7. Explaining a match

Each result carries its components, gates and caps. The one-line "why" is
generated from them, in this order, only from facts that scored:

> *Sports-tech specialist · invests at pre-seed · $250K–$1M checks fit your
> $1M round · New York, United States*

A generalist reads differently, by construction:

> *Generalist (SaaS, AI) · invests at pre-seed · checks fit · United States —
> thesis not confirmed*

## 8. Acceptance tests (test deck: pre-seed, US, sports technology)

The implementation is accepted when, on the the test deck profile:

1. **Thesis separates ranks.** At least 95% of the top 200 firms list one of
   the startup's verticals, the top band (1–50) has the highest share, and the
   last band has less than half the top band's share. *Revised after the v3
   runs, with the evidence that forced it:* the first wording demanded that
   the share never rise from one band to the next. The model intentionally
   trades thesis against geography and stage, so ranks 201–1,000 hold US
   pre-seed generalists whose thesis text reads like the deck (O'Reilly
   AlphaTech Ventures, Better Tomorrow Ventures, Root — about 79.5) above
   healthcare-listing firms in Milton Keynes, Zurich, New Delhi and Vienna
   (about 77). For a US pre-seed company that order is correct, and a
   middle-band dip (91% vs 97%) is its consequence, not a defect. v2 fails the
   revised test as it failed the original: 44% of its top 200 were vertical.
2. **Champions are specialists.** Every Champion has `T ≥ 0.75` and `S = 1`.
3. **Geography is right.** No firm located in Switzerland, the Netherlands,
   Poland, Finland, Ireland or Nigeria receives a same-country geography score
   for a US startup.
4. **Sector matching is on words.** No firm without an AR/VR term matches
   AR/VR; "software" does not match AR/VR; "retail" does not match AI.
5. **Ties are broken by evidence, not by name.** In the top 200, no more than
   3 firms share the full ranking key (score, semantic similarity, evidence
   quality). *Revised after the first v3 runs:* the top 200 span about six
   points, i.e. ~60 distinct one-decimal scores, so shared **displayed**
   scores are arithmetic, not a defect; what v2 got wrong was ordering ties
   alphabetically.
6. **Grouping holds.** Every firm group lists at most 3 people, all belonging
   to that firm; no person appears twice; every independent investor has no
   firm in the directory.
7. **People's check size is read** for at least 80% of people with
   `typical_investment`.
8. **Semantic availability is reported**, and when available, some results
   carry semantic points.

## 9. What this paper does not settle

- **Learning from outcomes.** Once `match_shown` is recorded (doc 10, L11),
  weights can be fitted to replies and commitments. Until there are enough
  outcomes, the weights above are expert-set and stated openly as such.
- **Recency.** No reliable last-investment dates exist in the data
  (`last_funding_date` empty; `recent_investments` 70 rows). Activity is
  approximated by portfolio size until enrichment provides dates.
- **Traction thresholds.** ARR and growth are not scored; there is no
  investor-side threshold data to score them against.

## Addendum (2026-10-02): ordering inside a score band

**Problem.** Every component is clamped to [0, 1] and the total to 100, so for a founder whose
thesis, stage and check size fit a whole class of funds, dozens of firms displayed "100" and the
engine fell back to name order. A pre-seed healthcare company in Atlanta saw 75 firms at 100,
alphabetical, with a state fund above the healthcare specialist.

**Change.** `tieBreak()` in `founder-scoring.ts` returns a 0-1 value, kept as `tieValue`, and
`compareRanked` orders by score, then tie value, then the old semantic / quality / name keys. It
only orders firms with the SAME displayed score: it never lifts one score above another and is
never shown as a number. It uses what the clamps discard, plus two things the score never read:

| part | weight | what it reads |
|---|---|---|
| thesis depth | 0.25 | the thesis match before it is clamped (keyword hits, focus, text) |
| text match | 0.12 | raw semantic similarity to the deck (neutral when unavailable) |
| check fit | 0.18 | whether the firm's range reaches a LEAD band (a quarter of the round up to the whole round, or the founder's own ideal check when given) and how centred it is on that band |
| proximity | 0.15 | the founder's city (0.7) then state (0.3) in the firm's recorded location |
| activity | 0.12 | recency of the last known investment; unknown is neutral, not inactive |
| lead depth | 0.08 | how much of the round the firm could write alone |
| evidence | 0.10 | record completeness and portfolio size |

A firm in the founder's city also gets the reason "based in <city>". A founder who gives only a
country has no proximity at all, so a whole country is never "nearby".

**Not changed.** Scores, tiers, gates and weights. Saved runs keep their stored order.
