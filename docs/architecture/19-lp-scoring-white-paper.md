# 19 — LP scoring: what a good LP for *this* fund looks like

**Date:** 2026-09-23 · **Status:** design, then build · **Closes:** doc 18 §8.3
(the four defects the first real run exposed) · **Mirrors:** doc 11, which did
this for founder → investor scoring.

---

## 1. What is wrong today, measured

The LP scorer adds absolute points to a maximum of 118 — LP type 28, AUM 25,
geography 22, sector 20, thesis 18, contact 5 — and calls 80 a Champion. Four
consequences, all visible in the Summit run (doc 18 §8):

| # | Defect | Evidence |
| --- | --- | --- |
| **1** | **"Anchor" means "large", not "right for this fund".** `isAnchor` is `AUM ≥ $500M`, full stop; the fund's raise is not an input. | **68%** of qualified firms (7,765 of 11,444) are tagged ANCHOR. 48% hold over $1B. |
| **2** | **Ties are unbroken.** Nine firms shared score 88 at the top; the order inside a tie was whatever the scan produced. | Doc 18 §8.3 |
| **3** | **People cannot reach the top tiers.** A person has no AUM, so 25 of the 118 points are unreachable — their ceiling is 93, and Champion at 80 asks 86% of it against 68% for a firm. | **0** Champions and 4 Priority A out of 1,950 contacts, against 12 and 367 for firms. |
| **4** | **Records that are not people are scored as people.** | 320 contact rows read as organisations — "Harvard Management Company Management Company", titled "Early Light Ventures". |

Defect 1 is the serious one. A $27B university endowment is not a prospect for
a **$40M fund with a $1M minimum**: its smallest sensible commitment is larger
than the fund. Ranking by size puts exactly the wrong LPs first, with
confidence.

## 2. The model

The same shape as doc 11, so both directions of the platform score the same
way: every component is continuous in **[0, 1]**, weights sum to **100**, and
must-haves are gates that move a score into the band below rather than points
that quietly accumulate.

| Component | Firms | People | What it asks |
| --- | --- | --- | --- |
| **Capacity fit** | 25 | 25 | Can they write the cheque *this* fund needs? |
| **LP type** | 25 | 25 | Is this an allocator at all, and which kind? |
| **Thesis alignment** | 20 | 20 | Does their stated strategy match the fund's? |
| **Sector** | 15 | 15 | Do they invest where the fund invests? |
| **Geography** | 10 | 10 | Are they reachable in the fund's markets? |
| **Evidence** | 5 | 5 | How much do we actually know, and can we reach them? |

A person is scored on the identical scale. Where a person's firm is known,
**capacity is inherited from that firm**; where it is not, capacity is scored
from what the bio says and its weight is *redistributed*, never left at zero
(§4). Champion then means the same thing on both sides.

## 3. Capacity: the cheque, not the balance sheet

An LP's usefulness to a fund is the cheque they would plausibly write.

```
expected ticket  ≈  AUM × allocation rate(LP type)
```

Allocation rate is the share of AUM a type of allocator typically puts into a
single venture fund — small, and smaller the larger the institution:

| LP type | Rate | Why |
| --- | --- | --- |
| Fund of funds | 2.0% | Committing to funds *is* the strategy |
| Family office / SFO / MFO | 1.5% | Concentrated, discretionary |
| Endowment / foundation | 0.5% | Diversified, policy-bound |
| Pension / sovereign | 0.25% | Very large, very diversified |
| Asset & wealth manager | 0.5% | Allocates on behalf of others |
| Unknown | 1.0% | A neutral assumption, and flagged as such |

The fund gives the band. With `minimum commitment` (or 2.5% of target when it
is not stated) as the floor and **30% of target** as the ceiling — no single LP
should be a third of a fund — capacity scores as:

| Expected ticket | Score | Meaning |
| --- | --- | --- |
| Inside the band | **1.0** | Can write a cheque this fund can take |
| Above the ceiling, within 4× | 0.6 → 0.3 | Would have to write small for them |
| More than 4× the ceiling | **0.15** | The fund is too small to be worth their process |
| Below the floor, within 2× | 0.5 | Could stretch, or come in under the minimum |
| Below half the floor | **0.1** | Cannot meet the minimum |
| AUM unknown | **0.5** | Unknown is unknown — never a top score, never a zero |

**Anchor** is then a narrow, earned label: expected ticket ≥ 10% of target
**and** ≤ 30% of target — an LP that could take a tenth of the fund or more in
one commitment, and is allowed to. On the Summit deck that is a band of roughly
$4M–$12M per ticket, and it should apply to a small minority, not two thirds.

## 4. People are not second-class

Three changes:

1. **Inherit the firm.** The engine already loads a contact's `firm_id`; where
   it resolves to a scored LP firm, the person takes that firm's capacity and
   its AUM evidence.
2. **Redistribute when it cannot.** With no firm and no AUM signal, capacity's
   25 points are spread across the components a person *does* evidence — LP
   type +10, thesis +10, evidence +5 — so the scale still totals 100.
3. **Seniority is evidence, not capacity.** A CIO or Head of Investments is
   more likely to be the decision-maker; that belongs in the evidence
   component, not in a capacity number nobody measured.

## 5. Records that are not people

A person's row must read like a person. A name that matches a known firm name,
carries a corporate suffix (`Capital`, `Ventures`, `Management Company`, `LLC`,
`Trust`, `Endowment`, `University`), or repeats a phrase ("Management Company
Management Company") is **not scored as a contact**. It is counted in the
funnel as `notAPerson` so the number is visible rather than silently dropped,
and the firm it names is already in the firm list.

## 6. Gates and tiers

Tiers are unchanged — Champion 80, Priority A 60, Priority B 40, Prospect C 20
— but they are now on a 0–100 scale both sides score against, and two gates
apply after the weighted sum, exactly as doc 11 §4.10 does:

- **`capacity_mismatch`** — expected ticket below the floor or more than 4×
  the ceiling caps the score into the band below. Wrong size is not a
  disqualification, it is a demotion.
- **`champion_gate`** — a Champion must have capacity ≥ 0.6, a recognised LP
  type, and at least one of thesis or sector evidence. Without that it lands at
  the top of Priority A.

## 7. Tie-breaking

Equal scores are ordered by evidence, never by scan order, and the key is
recorded so any ordering can be explained:

```
score  →  capacity certainty (known AUM beats assumed)
       →  thesis signals matched
       →  sector matches
       →  evidence (contactable, complete)
       →  name (stable, so runs are reproducible)
```

## 8. Acceptance

Measured against the same deck (doc 18 §8), after the change. **Two of these
were not met as written — §9 records what happened instead rather than
restating the target.**

1. **Anchors are a minority** — under 15% of qualified firms, and every one
   inside the band of §3. *(Landed at 22.5%, all inside the band. 545 firms
   that could write $4M–$12M into a $40M fund is a real number, not
   inflation, so the threshold was the guess — not the result.)*
2. **The top 50 shifts** towards LPs that can write $4M–$12M into a $40M fund;
   institutions whose smallest cheque exceeds the fund fall out of the top tier.
3. **People reach the tiers** — Champions and Priority A exist among contacts,
   and a person at a known LP firm scores comparably to that firm. *(Priority A
   went 4 → 23 and Priority B 535 → 913; no contact reaches Champion — §9.2.)*
4. **No organisation appears in the contact list**, and the funnel reports how
   many were removed.
5. **No tie in the top 200 is broken arbitrarily** — the largest group sharing
   the full ranking key is small, as doc 11 §8.5 requires of the founder side.
   *(51 → 22. Ordering is deterministic and evidence-ranked; closing the rest
   needs a semantic layer the LP engine does not have — §9.2.)*
6. Every component and gate is recorded per result, so a score can be explained.

---

## 9. What changed, measured on the same deck (2026-09-23)

Same fund, same directory, before and after.

| | Before | After |
| --- | --- | --- |
| Qualified firms | 2,361 | 2,420 |
| **Anchors** | **1,553 (66%)** | **545 (22.5%)**, and **0 outside the band** |
| Firm Champions | 12 | 2 |
| Firm Priority A | 367 | 75 |
| Contact Priority A | **4** | **23** |
| Contact Priority B | 535 | 913 |
| Contacts carrying capacity | — | 157 (inherited from their firm) |
| Organisations in the contact list | **320** | **0** (8,372 removed, reported in the funnel) |
| Largest tie in the top 200 | 51 sharing the full key | 22 |
| Top-ranked LP | MIT ($27B — a $135M cheque) | University of North Dakota ($300M — a $1.5M cheque) |

The re-ranking is the point. A $27B endowment's smallest sensible commitment is
three times the whole fund; it now carries `capacity_mismatch` and sits below
allocators that can write $1M–$12M. The top of the list is university
endowments and family offices sized for a $40M vehicle.

### 9.1 Three revisions the measurements forced

1. **Person weights.** The first split gave thesis 30 of the redistributed
   weight. It measured near zero for nearly every person — LP bios are not thin
   (0 of 1,339 are under 40 characters), they simply do not discuss a fund's
   thesis. Moved to LP type 40 and evidence 20, and contact Priority A went
   from 5 to 23.
2. **Continuous sector and evidence.** Banded sector points (20/15/8) left 51
   firms sharing one score in the top 200. Sector is now the share of the
   fund's sectors matched, decayed by how many sectors the LP claims — the
   founder side's focus decay (doc 11 §4.3) — and evidence is continuous in
   description, sectors, website and AUM. Ties fell to 22.
3. **Anchor is never inherited.** Dedup merges tags from duplicate rows, which
   handed one survivor an ANCHOR its own AUM did not support. The survivor's
   own capacity decides.

### 9.2 What is still not right

- **22 firms still share the top-200 key.** The founder engine gets this down
  to 2 because it has a semantic layer: a continuous per-pair similarity
  between the deck and each investor's thesis text (doc 11 §4.2). The LP engine
  has no equivalent, so firms with unknown AUM, the same type and no sector
  overlap are genuinely indistinguishable on the evidence held. Ordering inside
  a tie is now deterministic and evidence-ranked rather than arbitrary, which
  was the defect; separating them further needs embeddings over LP
  descriptions, and that is its own piece of work.
- **No contact reaches Champion** — the highest scores 77.5. A person can only
  get there with inherited capacity *and* sector *and* geography *and*
  contactability, and nobody in this directory has all four strongly. That is
  the honest answer rather than a loosened gate; inflating it would recreate
  the defect this paper removed.
- **Capacity assumes an allocation rate.** The rates in §3 are industry
  convention, not per-LP observation. Where an LP states its own commitment
  size, that should be read and used instead.

---

## 10. Geography and fund size (2026-09-25)

Measured on Winner Capital — a **$5M North American consumer AI seed fund** — the
top five were four university endowments, three of them overseas, with the
University of North Dakota the single Champion at 80. Three separate defects
produced that, and only one of them was a weighting problem.

### 10.1 A continent was not a geography

`REGION_PHRASES` mapped `"north america"` to `null`, alongside `"latin america"`,
`"south america"` and `"central america"`. Nulling those three is right — it stops
`"…america"` being read as the US, a defect this file already records. Nulling the
fourth was not: **"North America" is where the US and Canada are**, and it is what
the deck extractor returns for a fund that says "North American" and nothing more
specific.

The consequence was not a low score but *no* score. Every US branch of
`scoreGeography` was gated on the fund's own regions resolving:

```ts
if (regions.includes("us") || …) {
  if (hqRegions.some(r => [...].includes(r))) return { points: 10, tag: "US" }
}
```

With `hqRegions` empty, an allocator in New York fell through to `INTL` and scored
**1 point out of 22 — the same as one in Daejeon**. Geography was not
under-weighted; it was inert.

Fixed by making `north_america` a real region, adding `REGION_PARENTS` so a
continent-level focus matches its sub-regions (`us_east` → `us` → `north_america`),
and letting the fund's **stated focus** establish a match without requiring its HQ
to resolve.

### 10.2 Being in the wrong place cost almost nothing

Geography was 10 of 100, the lowest real weight. It is now **18**, taken from
`lpType` (25 → 20) and `thesis` (20 → 18) — `lpType` was over-weighted precisely
because it rewards "is a large recognisable institution", which is the failure this
section exists to correct.

Weight alone was still not enough to stop a strong sector match carrying an
unreachable LP to the top, so an LP we can positively place **outside** a fund's
stated geography now trips a `geography_mismatch` gate and drops a band, exactly as
a capacity mismatch does (§6).

An LP whose location we *cannot* place is deliberately **not** gated.
`GEO_REGIONS` is a keyword list, not a gazetteer: "Austin, Texas" resolves to
nothing just as "Daejeon, South Korea" does, and demoting everything unparsed would
punish real US allocators. Unplaceable scores 1 and loses on points, not by gate.

### 10.3 The cheque fitted; the allocator did not

The sharpest defect, and the one the arithmetic hid. The University of North Dakota
endowment has a **known** $300M AUM. At `institutional_other`'s 0.5% rate that is a
$1.5M cheque — and a $5M fund's ceiling is 30% of target, exactly $1.5M. It landed
`inBand`, scored a **flat 1.0**, and picked up an `ANCHOR` tag.

Every number was right. The premise was wrong: an endowment, pension or sovereign
fund has a **manager minimum** as well as a cheque minimum — a policy floor on fund
size below which a manager is un-investable however well the cheque works.
`INSTITUTIONAL_FUND_FLOOR` encodes that, checked *before* the cheque arithmetic,
because no cheque size rescues a manager minimum. Family offices, HNW angels and
fund-of-funds are exempt: backing small and first-time managers is what many of
them do.

A second, smaller case: the mismatch gate only ever fired on a *known* AUM, so an
endowment with no AUM field scored a neutral 0.5 and was indistinguishable from a
family office with no AUM field — the gap §9.2 admits. `TYPICAL_AUM_FLOOR` now
gives structurally large types a conservative size prior when AUM is missing. It
can only **demote, never promote**: the evidence is a category, not the allocator,
so it speaks only when it says "too large".

### 10.4 Measured after

Same fund, same directory, same 250 qualified firms:

| | Before | After |
| --- | --- | --- |
| 1 | University of North Dakota — 80, **champion** | Arcadian Capital — 72.3 |
| 2 | Chungnam National University (South Korea) — 72.1 | Porthcawl Holdings (San Antonio) — 66 |
| 3 | Annamalai University Trusts (India) — 69.8 | WhitbeckBennett (Virginia) — 66 |
| 4 | Arcadian Capital (New York) — 69.6 | Bell Capital (Carlsbad) — 65.8 |
| 5 | University of Cambridge Enterprise (UK) — 68.4 | Ck Properties (Canada) — 64.6 |

North American in the top 8: **2 of 5 → 8 of 8**. Universities in the top 8: **4 →
0**. The top is now a single family office in New York, which is the profile that
actually backs a $5M first-time consumer fund.

**No LP reaches Champion now**, and that is the honest answer rather than a
loosened gate — the same argument §9.2 makes for contacts. For a $5M first-time
fund, nobody in this directory is a slam-dunk.

### 10.5 What is still not right

- **`GEO_REGIONS` is a keyword list.** Texas, the Nordics, most of Asia and all of
  Africa resolve to nothing, so those LPs score 1 on geography whether or not they
  are in the fund's markets. §10.2's decision not to gate the unplaceable is a
  mitigation, not a fix; the fix is a real gazetteer.
- **The floors in §10.3 are judgement, not observation.** They are deliberately
  conservative, and a real endowment that does run an emerging-manager programme
  will be demoted with everything else. Where an LP states its own minimum fund
  size, that should be read and used instead — the same caveat §9.2 records for
  allocation rates.
- **Nothing re-scores what is already in a CRM.** The 50 LPs promoted before this
  change were chosen by the old model and are still there.
