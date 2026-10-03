# 24 — Merging an investor-data drop into a live directory

**Date:** 2026-09-25 · **Status:** design, then build · **Scope:** 19
spreadsheets against 47,275 people and 18,982 firms already in the directory.

---

## 1. What arrived

| Kind | Files | Rows |
| --- | --- | --- |
| **Contact lists** (name · title · firm · email · linkedin · location) | 14 | ≈ 1,850 |
| **Global database** (Individual Investors + Firms & Funds sheets) | 1 | ≈ 999 people, ≈ 2,250 firms |
| **Firm lists** (name · type · HQ · AUM · website) | 2 | ≈ 456 |
| **Not data** — MCP guides, a Chrome-extension page, an outreach prompt | 4 | — |

The four non-data files are ignored. They are documentation, not directory
rows, and nothing in them belongs in `investors` or `investment_firms`.

**Five of the spreadsheets are re-drops of another one in the same batch** — a
`…-2.xlsx` copy of the same list. Deduplicating the batch against itself comes
before touching the database.

Header rows are not consistent: most files carry a banner (`8FUNDRAISING ·
VC DROP #04`) above the real header, on rows 1–4. The reader finds the header
row rather than assuming one.

## 2. The rule this import is built on

> **Fill what is empty. Never overwrite what is there. Delete nothing.**

A drop of unknown provenance is evidence, not truth. The directory holds
records that founders and GPs have already been shown, that sit in CRM
pipelines and in saved match runs. A bulk overwrite would silently rewrite
what someone acted on last week.

So a value that conflicts with an existing non-empty value is **recorded, not
applied** — the run writes a conflict report for the owner to settle. That is
the one place this import deliberately does less than "update or correct"
might suggest, and it is the reason it can be run without a backup.

## 3. Matching

Identity is decided in this order, strongest evidence first.

**People**

1. `lower(email)` — exact, and the only signal that is close to an identifier;
2. LinkedIn profile slug, normalised (`/in/jane-doe/` → `jane-doe`);
3. normalised full name **and** normalised firm name together. Neither alone:
   "James Smith" matches 40 people, and a firm name matches a whole team.

**Firms**

1. registrable website host (`www.acme.vc/about` → `acme.vc`);
2. normalised name, plus country when both sides state one.

Normalisation is the platform's own (`normPhrase`), so the importer and the
scorer agree on what two names being "the same" means.

## 4. What a row may set

On a **new** record: everything the sheet supplies.

On an **existing** record: only fields that are currently empty. Email,
LinkedIn, title, location, website, AUM, type, sectors and stages are all
fill-only. `source` is appended to, never replaced, so a record that came from
Folk and was enriched by this drop says both.

Every touched row gets `metadata.imports += { batch, file, at }` — provenance
per row, so any value can be traced back to the sheet it came from.

## 5. Duplicates already inside the directory

The batch will surface people and firms that are duplicated **in the database
itself**. Those are reported, not merged: `investors.id` and
`investment_firms.id` are referenced by CRM entries, LP match rows, founder
match results and outcome events, so collapsing two rows is a migration with
its own design — not a side effect of an import.

## 6. Running it

```
node scripts/import-directory-drop.mjs <files…>            # dry run, writes nothing
node scripts/import-directory-drop.mjs --apply <files…>    # writes
```

The dry run is the default and prints what would happen: matched, filled,
inserted, conflicting, skipped — per file and in total. Nothing is written
until the counts have been read by a person.

## 7. Tests

- the header row is found whatever row it starts on, and a banner is not
  mistaken for headers;
- a person matches on email, on LinkedIn slug, and on name+firm — and does
  **not** match on name alone;
- a firm matches on website host across `http/https/www/trailing path`;
- an existing non-empty field is never overwritten, and the attempt is
  reported as a conflict;
- an empty field is filled;
- re-running the same file changes nothing the second time (idempotent).

---

## 8. What the run did (2026-09-25)

18 spreadsheets, 5,652 rows read. The four non-data files were ignored.

| | People | Firms |
| --- | --- | --- |
| Matched an existing record | 197 | 2,090 |
| **Inserted** | **2,177** | **1,672** |
| Existing record filled in | 121 | 748 |
| Duplicate within the batch | 572 | 1,596 |
| Disagreed — reported, not applied | 160 | 858 |

Directory: **47,275 → 49,452 people**, **18,982 → 20,654 firms**, and email
coverage 9,058 → 10,125.

Three of the five re-dropped files resolved to **zero** new records, which is
the in-batch dedupe doing exactly its job.

### 8.1 The conflicts are mostly not conflicts

Of the disagreements, almost none are contradictions. They are multi-office
firms — Bessemer at Redwood City against Tel Aviv, EQT at Stockholm against
London, Accel at United States against London — where the sheet names a
different office from the one on record. Fill-only keeps the record's HQ and
notes the difference, which is the right outcome and needs no decision.

Two classes were pure noise and are now suppressed rather than reported:
country spellings (`United Kingdom` / `UK`) and type spellings (`VC` /
`Venture Capital`).

### 8.2 Three defects this run exposed, two of them in the importer

1. **A firm sheet read as people.** The global database's *Firms & Funds*
   sheet names entities — "01 Ventures", "100X.Vc" — and a per-row guess
   cannot tell those from "Aaron Levie". Classification moved to the sheet,
   which knows. Caught in the dry run, before anything was written.
2. **A person's role written as a firm's type.** On a contact sheet, `TYPE`
   holds "VC Partner" — the person's role. It was reaching the firm record on
   the insert path after being fixed on the update path. **105 firms were
   written with a role as their type and have been repaired**; the column is
   now populated only from a firm sheet.
3. **"Known for" is not a firm name.** The same sheet's `FIRM / KNOWN FOR`
   column holds "Box (CEO)", "Clearco (co-founder), angel" — an employer and
   a role. **109 firm names were written with that furniture and have been
   cleaned.** Note what these records are: an angel's operating company, not
   an investor. They carry no type, so they do not rank as investors.

A fourth, found by the tests rather than the data: an uppercase `HTTPS://…`
was read as the host `https`, so such a firm would never match and would be
duplicated. No row in this batch was affected.

### 8.3 What was deliberately not done

No existing value was overwritten and nothing was deleted. Duplicates already
inside the directory — distinct from duplicates within the batch — are still
there, because `investors.id` and `investment_firms.id` are referenced by CRM
entries, match rows and outcome events, and collapsing two records is a
migration of its own (§5).

## Addendum 2026-10-03: what the second real drop taught

Applied to production: 548 people and 309 firms added, 121 empty firm fields filled, nothing overwritten, nothing deleted.
- **Firms** are now matched with the platform's own name rules (accent spellings, "ACR | Full Name", stated former names, a firm written as its initials), on top of host and name. This found 18 existing firms the first pass would have duplicated.
- **People with no email, LinkedIn or firm** are matched on full name plus place; a bare name never matches. A person with none of these identifiers is left out, because every re-run would add them again.
- **Banners and adverts** in a name column ("Need allocators beyond this list? … at 8raise.com") are recognised and skipped. Two such rows were inserted by the first apply and removed by id.
- Re-running the same eight files now finds 0 new people and 0 new firms.
