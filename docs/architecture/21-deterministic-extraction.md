# 21 — The same deck must give the same shortlist

**Date:** 2026-09-24 · **Status:** design, then build · **Closes:** doc 20 §5.1
and doc 18 §8.4 · **Corrects:** doc 20 §5.1's diagnosis, which was wrong.

---

## 1. What actually varies

Two runs of one deck, minutes apart, produced 10,000 firm groups and 9,239.
Doc 20 §5.1 blamed the sector list — the model read "SaaS" once and "enterprise
software" the next. **That diagnosis does not survive checking.** Both lists
normalise to the same canonical groups:

```
["sports technology","healthtech","ai","saaS"]              → sports, healthcare, ai, saas
["sports technology","healthtech","enterprise software","ai"] → sports, healthcare, saas, ai
```

Same four groups, different order. The scorer reads groups, not labels, so the
sector wording changed nothing.

What changed is the **prose**. `startupEmbeddingText` (semantic.ts:38) builds
the semantic query from fields the model writes freshly each time:

```
oneLiner · description · sectors · thesisKeywords · pitchDeckSummary
```

A different sentence is a different query vector, a different similarity
against all 66k investor vectors, different scores, and therefore a different
number of firms above the floor. The engine is deterministic; its **input is
not**, and the semantic layer amplifies small wording differences across the
whole directory.

So a founder who re-runs the same deck gets a different shortlist, and the
doc 11 §8.1 acceptance thresholds hold or fail depending on the sentence the
model happened to write.

## 2. Fix one: extract a document once

A deck's extraction is a pure function of its bytes and the extractor. Cache it.

```
key = sha256(file bytes) + kind (startup | fund) + EXTRACTOR_VERSION
```

| Decision | Why |
| --- | --- |
| **Scoped to the workspace** | A deck is confidential (doc 12). Two workspaces uploading the same file must not share a cache entry, and must not be able to learn that the other holds it. |
| **Version in the key** | A changed prompt or field set must not serve stale output. Bumping `EXTRACTOR_VERSION` invalidates everything without a delete. |
| **Model recorded, not keyed** | Which provider answered is useful provenance; it is not part of the identity of the document. A fallback to Qwen should not silently produce a second profile for the same deck. |
| **180 days**, matching runs | A run keeps its results that long (doc 14 §6); its input should outlive it. |
| **Never fails the request** | A cache read or write that throws is logged and skipped — extraction still runs. |

The cache stores the extracted fields, which are derived from a confidential
document, so the row is as sensitive as the deck: workspace-scoped, no
cross-tenant read, removed when the workspace is.

## 3. Fix two: sectors come from the vocabulary the scorer uses

The sector label was not the cause here, but "enterprise software" landing in a
sports-technology profile is still a defect waiting for a deck the vocabulary
does not cover. Extraction now **snaps** its sector list to the canonical
groups in `lib/matching/normalize/sectors.ts`:

- every returned label is mapped through the same `PhraseMap` the scorer uses;
- anything that maps to nothing, or to a generic marker ("technology",
  "enterprise", "platform"), is **dropped** rather than carried as a sector;
- what survives is deduplicated and ordered **verticals first, then
  horizontals**, each alphabetically — so the list is stable no matter what
  order the model returned;
- the primary sector keeps its place at the head of the list when it survives.

Two consequences worth stating: the stored profile now holds canonical ids
(`sports`, `healthcare`), and the UI renders them through `sectorLabel()`; and
because the sector list feeds the embedding text, a stable list is one fewer
source of drift.

## 4. What this does not fix

Caching makes a deck reproducible; it does not make two *different* decks for
the same company agree, and it does not make the model's prose good. The
remaining drift is now visible rather than mysterious: a cache miss means new
prose, and the run records which extraction it used.

The right long-term answer for the embedding is to build the query from fields
the founder can see and edit, not from prose the model rewrites — that is a
product change, not a caching one, and it is not made here.

## 5. Tests

- The same bytes extract once: the second call returns the cached fields and
  does not call the model.
- A different workspace with the same bytes does not read the first one's entry.
- Bumping the extractor version misses the cache.
- A cache failure still returns a live extraction.
- Sector snapping: "enterprise software" → `saas`; "technology" and "platform"
  are dropped; the order is stable regardless of input order; a label the
  vocabulary does not know is dropped rather than invented.

---

## 6. What shipped (2026-09-24)

`document_extractions` (workspace-scoped, versioned, 180 days), `extractOnce`
around both extractors, `canonicalSectors` applied wherever sectors are
produced, and the workspace threaded through the founder and fund extract
routes and both PDF pipelines. 14 new tests; suite 596 passing; build clean.

Verified on the real deck: two reads of the same file returned byte-identical
fields, and the cached row was removed with its workspace.

### 6.1 A path the first pass missed

Snapping was wired into `normalizeFields`, which only the AI path runs. The
**heuristic fallback** builds its own field object and returned `["ai/ml"]` —
a label the vocabulary does not use — so which extraction path happened to run
changed what a sector was called. Both fallbacks (founder and fund) now snap
through the same function. Caught by running the deck rather than by reading
the code: the live run fell back to heuristics, which is exactly when it
showed.

### 6.2 What the live check does and does not prove

The two reads that matched were both on the heuristic path, which is
deterministic by nature, so that run proves the **wiring** — cache written,
cache read, workspace scoping, cascade on delete — not that the model's prose
is now pinned. The mechanism is proven by unit test instead: an extractor stub
that writes different prose on every call is invoked exactly **once** for two
reads of the same bytes, and the second read returns the first one's fields.
