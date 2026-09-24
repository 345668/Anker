# 22 — The fallback should read the deck, not guess at it

**Date:** 2026-09-24 · **Status:** design, then build · **Follows:** doc 21 §6.2,
where a live run fell through to the heuristic path and read a sports-technology
deck as `["ai"]`.

---

## 1. What the fallback does today

It runs whenever no AI provider answers — a rate limit, a missing key, a
refused model. That is not rare: it happened twice in one afternoon of testing.
When it runs, this is what a founder gets.

| Field | Today | Measured against the real deck |
| --- | --- | --- |
| **sectors** | 8 hard-coded regexes: ai, saas, fintech, healthcare, edtech, climate, consumer, biotech | `["ai"]` — there is no sports pattern, and "HIPAA" and "sports performance" match nothing |
| **name** | `hints.startupName` only — the document is never read for it | *nothing*, from a deck that prints its name on all 14 pages |
| **askAmount** | `/(?:raising\|seeking…)\s*\$(\d+)\s*(million\|M\|K)?\b/` | *nothing*: `RAISING $1MM` does not match, because `\b` fails between the two Ms |
| **location** | not attempted | *nothing* — and location is required, so the profile can never be complete |
| **stage** | four regexes | `pre-seed` — correct |
| oneLiner, description, thesisKeywords | not attempted | *nothing*, so the semantic query has no text to embed |

So the fallback produces a profile that cannot run a match, from a deck that
states every one of those facts. It is not a safety net; it is a thin
re-implementation of work the platform already does properly elsewhere.

## 2. The fix: use the vocabulary that is already there

Every one of these has a normaliser the scorer already trusts, and the
fallback ignores all of them:

| Field | Reuse | Instead of |
| --- | --- | --- |
| sectors | `sectorProfile` + `canonicalSectors` — the full synonym vocabulary, the same one the scorer reads | 8 regexes |
| askAmount, valuation, check size | `parseMoneyRange` — handles `$1MM`, `€500k`, `1.5m`, ranges | one brittle regex |
| stage | `normalizeStages` | four regexes |
| location | `resolveGeo` over the deck text | nothing |

That alone turns `["ai"]` into the deck's actual sectors and recovers the ask,
the stage and the country — with no new vocabulary to maintain, and answers
that agree with the scorer by construction.

## 3. The rule: the fallback quotes, it never writes

The AI path *writes* a one-liner. The fallback must not: inventing prose
without a model is how a heuristic starts lying. It **quotes** instead.

- **name** — the most frequent distinctive token across pages, preferring what
  looks like a title; a deck prints its name repeatedly and a stop-list keeps
  ordinary words out. Falls back to the file's own name.
- **oneLiner** — the first substantial sentence of the document, verbatim.
- **description** — the next few, verbatim, capped.
- **thesisKeywords** — the sector terms that actually matched, not invented
  phrases.

Everything is traceable to a span of the document. `confidence` stays low and
the note keeps saying the fields are tentative, because a quote is evidence of
what the deck says, not of what it means.

This has a second benefit: quoted text is **deterministic**. Doc 21 cached the
model's prose to stop the shortlist moving between runs; the fallback's prose
is stable by construction because it is the deck's own words.

## 4. What stays true

- A heuristic profile is still marked heuristic, with `confidence: 0.3`, and
  the founder is still told to check every value.
- Missing is still missing: a deck that states no location still yields no
  location, and `startupReadiness` still refuses the run until a human
  supplies it (doc 09 §4). The fallback fills what the document supports and
  nothing else.
- The AI path is unchanged and still preferred.

## 5. Tests

Against a text fixture that mimics a deck, and asserting behaviour rather than
wording:

- sectors come from the shared vocabulary — a sports-and-health deck yields
  sports and healthcare, not `["ai"]` alone;
- `RAISING $1MM` gives 1,000,000; `$750K` gives 750,000; a deck with no ask
  gives none;
- the location is recovered when the text names a country, and left empty when
  it does not;
- the name is taken from the document, and the file name is used only when the
  text offers nothing;
- the one-liner is a **substring of the document** — the test asserts the
  quote, which is what stops the fallback inventing;
- two runs over the same text produce identical fields.

---

## 6. What shipped, measured on the real deck (2026-09-24)

The same 14-page deck, with **every AI provider refused**, so only the
fallback runs:

| Field | Before | After |
| --- | --- | --- |
| name | *none* | the company's own name, read from the deck |
| sectors | `["ai"]` | `["sports", "healthcare", "ai", "data"]` |
| primarySector | `ai` | `sports` |
| stage | `pre-seed` | `pre-seed` |
| location | *none* | `United States` |
| askAmount | *none* | `1000000` |
| oneLiner | *none* | a full sentence, quoted from the deck |

A profile that could not run a match now can, from a document alone.

### 6.1 Three things the measurement forced

Each of these was invisible in the code and obvious the moment a real deck
went through:

1. **Scanning the whole text at once makes every passing word a sector.** The
   first version returned eight — including `foodtech`, `iot` and `legaltech`
   from single mentions of nutrition, a device and a contract. Sectors are now
   ranked by **persistence**: the text is read in slices and a group must recur
   to survive. A company's market comes back page after page; an aside does not.
2. **The head of the list must be a market.** Ranking purely by frequency made
   `data` the primary sector of a sports company, because a horizontal recurs
   as often as the market does. The first **vertical** now leads; `canonicalSectors`
   already ordered the rest.
3. **A PDF breaks lines wherever the page ended.** Splitting on newlines
   produced fragments — "Performance coaches still run on analog methods," —
   and print-to-PDF furniture ("9/21/26, 1:41 PM …") was being quoted as the
   company's one-liner. Sentences are now rebuilt before they are split, page
   furniture and spacing artefacts are refused, and a quote must finish a
   thought.

### 6.2 One vocabulary change

`hipaa`, `hipaa-compliant`, `patient data`, `electronic health record` and
`ehr` joined the healthcare synonym group. A deck that says HIPAA is a health
company, and so is an investor whose description says it — this improves the
scorer as much as the fallback.

### 6.3 Still honest about what it is

`confidence` remains 0.3, the note still tells the founder to check every
value, and the quotes are the deck's own words. The fallback reads better now;
it still does not understand.
