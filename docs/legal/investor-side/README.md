# Investor side: counsel pack

*Prepared 2026-10-21. Drafts for the founder and for counsel. **Nothing here is legal advice and nothing is a legal position**: where a position is stated it is a proposal for counsel to accept, change or reject, as in the other drafts in `docs/legal`.*

## What this is
Anker now has an investor side (docs 61 and 64 to 72 in `docs/architecture`): people can sign up as investors, keep identity documents once, find funds, ask to talk, exchange messages and files, accept a fund's NDA, be invited by funds, and be erased. It is **built, tested and closed** behind three switches. This pack lets counsel decide whether, and on what wording, to open them.

| Switch | What it opens | Where it is | State |
| --- | --- | --- | --- |
| `investor_signup` | Public investor sign-up (email code, then a password) | `platform_flags` | **off** |
| `listed_for_lps` (per fund) | A fund shows itself to registered investors | `funds` | **off for every fund** |
| `investor_discoverability` | Funds can find investors who opted in, and invite them | `platform_flags` | **off** |
| `investor_passport` | Investors may store identity documents and share copies with funds | `platform_flags` | **off** (so sign-up can open without Anker ever storing an investor's identity documents) |

Verified on production on 2026-10-21 and 2026-10-23: all flags off, no fund listed, no investor profile, no relationship.

## How to read it
1. `00-counsel-brief.md`: the cover brief. Facts about Anker, then the questions, numbered, each with the decision it unlocks.
2. `01` to `06`: one document per area: what the product does (checked against code and tests), what it does **not** do, the data, the proposed position, the questions.
3. `07-wording-as-shipped.md`: **every sentence of legal weight the product shows or emails**, generated from `lib/investor/legal.ts`. A test fails if this file and the product differ, and the wording is pinned by hash: if counsel changes a sentence, it is changed in one place and the pack regenerates.
4. `08-retention-as-configured.md`: the retention periods the daily job runs, generated from the same numbers.
5. `09-investor-privacy-notice-DRAFT.md` and `10-investor-terms-DRAFT.md`: the investor notice and terms exactly as the pages show them (generated, draft), for counsel to correct. `11-key-management.md`, `12-eu-region-runbook.md` and `13-virus-scanning-runbook.md`: the runbooks that close the technical gaps. `14-launch-checklist.md`: what is left, in order, with the supervised run step by step.
6. `Anker-investor-side-counsel-pack.docx`: all of the above in one document for sending. It is a snapshot made with `pandoc` from the files in this folder (README, 00 to 14 in order, `--toc`); rebuild it after any change.

## What counsel can rely on, and what they cannot
- **Verified:** behaviour is covered by automated tests (the investor side has 147 integration and unit tests; the full suite of 2,384 tests passes). Statements marked *(tested)* name the behaviour a test pins.
- **Not verified:** nothing has been run end to end with a real person, a real email or a real fund. The pages have not been looked at in a browser by a person. The first supervised run is the step after counsel's answers (see the brief).
- **Known gaps, and what was done about each** (repeated where it matters):
  - *Region:* the database is in the United States (Neon, AWS us-east-1, confirmed); sign-in and email are in default provider regions not yet read off (`node scripts/legal/read-regions.mjs`). The passport has its own switch, off, so no investor identity documents are stored until this is settled; a runbook for moving the database to the EU is in `12`. **Not done:** the move itself (needs the founder's Neon and hosting access).
  - *Scanning:* a ClamAV hook is built with a fail-closed mode (`13`); off by default; not yet run against a real daemon.
  - *Keys:* rotation is built, tested and documented (`11`); not yet run on production data; the key is still an environment variable.
  - *Terms:* investor terms and an investor notice exist as pages with a draft banner (`10`, `09`); counsel's text and the bracketed facts are still needed.
  - Also open: the retention periods are proposals; no formal breach runbook existed before this pack (a draft is in `06`).

## Order of work (suggested)
1. Counsel answers the *blocking* questions (marked **B** in the brief): sign-up terms and notice, the role of Anker, identity-document handling, the database region.
2. Founder opens `investor_signup` for the supervised run only.
3. Counsel answers the remaining questions; wording changes are made in `lib/investor/legal.ts` and the pack regenerates.
4. A first fund is listed in a throwaway fund; then, after discoverability questions are answered, that flag, last.
