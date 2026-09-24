# 23 — Keeping a confidential name out of the repository

**Date:** 2026-09-24 · **Status:** design, then build · **Follows:** the
redaction in doc 09/11/14, which has now been undone twice by new work.

---

## 1. Why

A founder's deck and a GP's deck are confidential. Their contents were removed
from this repository once, deliberately. Since then the name has come back
**twice**, both times in work written after the redaction:

- a new test used it as a fixture name;
- a new document used it in a results table.

Both were caught by reading the diff before committing. That is not a control;
it is a person remembering. The third time it will ship.

## 2. The awkward part: the list is the leak

The obvious implementation — a file listing the forbidden words — publishes
exactly what it is meant to suppress, in a repository that may be shared,
mirrored or made public. A redaction list in plaintext is worse than no list,
because it collects the sensitive terms into one convenient place.

So the check stores **sha256 of each term, never the term**:

```json
{ "terms": ["a3f1…", "9c02…"], "note": "hashes only — see docs/architecture/23" }
```

A term is added without ever writing it into a file a human reads:

```bash
pnpm redaction:add "the term"     # prints the hash; paste that into the list
```

The consequence is that the check can say *that* something is wrong and
*where*, but not *what*. That is the right trade: the person who sees the
failure has the document in front of them and knows the word; the repository
never does.

## 3. How it reads the repository

Text is normalised the same way on both sides — lowercased, split on
non-alphanumerics — so `Power-4`, `power 4` and `POWER 4` are one term, and
`pitch.fytt.io` contains the token the list knows.

Phrases up to four words are supported. Hashing every n-gram of 1,932 tracked
files would be slow, so the scan is two-stage:

1. hash each **word** and test it against a set of first-word hashes;
2. only where that hits, hash the 2-, 3- and 4-word phrases starting there.

The common case is one hash per word, which keeps a full-repository scan in
the low seconds.

**Scope:** every tracked file except binaries, lockfiles and the check's own
list. Not just the diff — a term that slipped in three commits ago should keep
failing until it is gone.

## 4. What it does not do

- It does not scan git history. Something already committed and pushed needs
  history rewriting, which is a decision for a person, not a CI job.
- It does not catch paraphrase, a company's financials written without its
  name, or an uploaded binary. It catches the specific failure that has
  actually happened twice: a name typed into new code or a new document.
- It is not a substitute for reading a diff. It is the floor under it.

## 5. Surfaces

| Path | Purpose |
| --- | --- |
| `scripts/check-redactions.mjs` | The scan. Exit 1 with file and line on a hit. |
| `scripts/redactions.json` | Hashes only. |
| `pnpm redaction:check` | Run it locally, the same way CI does. |
| `pnpm redaction:add "<term>"` | Print a hash to add, without writing the term anywhere. |
| CI job **Redaction** | Runs on every PR and every push to main, beside typecheck and tests. |

## 6. Tests

- A file containing a listed term fails, and the failure names the file and
  line but not the term.
- Case and punctuation do not matter: the same term in another form still
  fails.
- A multi-word term is caught, and its individual words are not.
- A clean tree passes.
- The list file itself is skipped, so the hashes never match themselves.
