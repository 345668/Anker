# 55. Spec: directory identity (duplicate firms and people, a review queue, reversible merges)

Status: **spec. E1 (detection and the read-only review queue) is built and live; E2 to E4 are not (section 13).** Implements the first part of doc 37 section 5.3 (gaps G6 and G7, ordering item 4 of section 19.2), scoped to the shared investor directory: firms and people. The cross-type `entities` graph (LPs, deals, portfolio companies, funds) is deliberately left for later (section 12). Builds on doc 24 (the import rules), doc 54 (the person registry and tombstones) and `lib/matching/v2/dedup.ts` (the matching rules already proven in imports).

## 1. The problem, measured on production (2026-10-16)
- **21,024 firms and 50,074 people.** Running the platform's own firm clustering rules over every firm finds **1,673 clusters holding 3,850 rows, so up to 2,177 rows (10%) that may be a second record of a firm already there.** Cluster sizes: 1,351 pairs, 230 of three, 62 of four, 30 of five or more.
- **The clusters are not all duplicates, and the rules cannot tell which.** Reading the largest by hand: *Kindred Capital / Kindred Capital VC / Kindred* and *Spring Capital* in two sources are the same firm; *Startupbootcamp FinTech London / Israël / IoT London / Smart City & IoT Amsterdam* and *Techstars (Sports track) / Techstars Alabama Power EnergyTech Accelerator* are **one brand running separate programmes** (a parent with children, not duplicates); and *Hera, Hidaka, Hopp, Hansmann Family Office* are **different firms that share a generic word** and only look alike through the initials rule. Merging by rule would damage the directory as surely as leaving it alone.
- **People:** 1,869 groups of rows with the same name at the same firm id (probably the same person entered twice), 192 email addresses on more than one row, 2 profile URLs on more than one row.
- **What it costs.** A run ranks the same firm twice or splits its contacts across two records; a founder is shown two cards for one investor; an LP-matching score is computed on the thinner of two records; and an import that "fills empty, never overwrites" cannot resolve the split. The earlier import (doc 24) already found 716 conflicts it could not settle and left open.
- **What exists.** `dedup.ts` clusters at read time inside a run (it hides duplicates in results, it does not fix the data). `import-directory-drop.mjs` matches new rows to existing ones. Nothing records a decision, so the same pair is re-argued every run and every import.

## 2. Principles
1. **A machine proposes, a person decides.** Nothing that could be a different firm is merged automatically. The narrow exceptions are in section 5.
2. **Three answers, not two.** A pair is *the same*, *not the same* (remembered, so it is never asked again), or *related* (a parent brand and its programme). The third answer is what stops a good merge rule from destroying real structure.
3. **A merge is reversible.** Nothing is deleted at merge time. The loser becomes an alias that points at the survivor and can be restored for 90 days with every reference put back.
4. **Everything that points at a record moves with it.** The person registry of doc 54 already lists the 17 columns that hold a person id; a firm registry with the same coverage test is added. A merge that cannot re-point every reference does not run.
5. **Workspaces are never surprised.** A workspace's CRM copy keeps its own id and fields; only its pointer to the directory record moves. A merge never rewrites what a customer typed.
6. **Provenance survives.** The survivor keeps the losers' sources, so doc 54's source register and the use gate still know where each fact came from, and an erased or withdrawn source takes its facts with it.

## 3. Words used here
- **Candidate**: a proposed pair (or cluster) of records the system thinks may be one.
- **Survivor / loser**: the record kept, and the record folded into it.
- **Alias**: a record of "old id X now means Y".
- **Hierarchy**: a parent firm (brand) with child firms (programmes, funds, regional offices), each a real record with its own contacts.
- **Evidence**: the facts shown beside a candidate: shared website host, shared email domain, name similarity by each rule, shared people, shared sources, country and location.

## 4. Data model (all additive)
- `directory_candidates`: `id`, `kind` (`firm` or `person`), `a_id`, `b_id` (ordered, unique pair), `tier` (`certain`, `probable`, `possible`), `evidence` (jsonb, facts only), `status` (`open`, `merged`, `distinct`, `related`, `stale`), `decided_by`, `decided_at`, `reason`, `created_at`. A decision of `distinct` or `related` is never reopened by the detector.
- `directory_aliases`: `old_id`, `kind`, `new_id`, `merge_id`, `created_at`. Lookups by old id resolve through it, so a saved link or a stale reference still lands on the right record.
- `directory_merges`: `id`, `kind`, `survivor_id`, `loser_id`, `by`, `reason`, `fields_filled` (names only), `repointed` (counts per table), `undo_until`, `undone_at`. The loser row is kept, hidden (`is_active` false, `merged_into` set), until the undo window closes and the maintenance job removes it.
- `investment_firms.parent_firm_id` for hierarchy (nullable, one level).
- A **firm registry** (`lib/directory/firm-registry.ts`) listing every column that holds a firm id (`investors.firm_id`, `investor_company_links`, the CRM and deal tables), with the doc 54 style coverage test and live-schema snapshot.

## 5. Detection (slice E1)
A nightly job (and on demand in SAIL) scores pairs, with indexes so it never compares all pairs (a past all-pairs comparison hung at 21,000 firms; there is a CI time budget). Evidence comes from the rules in `dedup.ts` plus, for firms, shared website host, shared email domain across their people, and shared people; for people, shared email, shared profile URL, same name at the same firm, and name similarity at firms already judged the same.
Tiers:
- **certain (people only)**: same email address, or same personal profile URL, with a compatible name. May be merged automatically (section 6), because two people do not share a mailbox or a profile.
- **probable**: same website host and a normalised-name match, or same name at the same firm. Shown first in the queue, one click to confirm.
- **possible**: the rest of the rules' output (initials, acronyms, shared generic words). Shown only when the reviewer asks, never as the default queue, so the family-office look-alikes do not drown real work.
- **Firms are never merged automatically at any tier.**
The detector also proposes **hierarchy**: a cluster whose members share a brand prefix and differ by place, track or programme is offered as parent and children.

## 6. Decisions and merges (slices E2 and E3)
**Review queue (SAIL, Directory identity).** A candidate shows both records side by side with their fields, sources, people counts and which workspaces refer to each (counts only), and the evidence. Actions: **Same** (choose the survivor, default the richer record), **Not the same**, **Related** (choose parent), **Skip**. A reason is optional for *Not the same*, required for a merge above 10 workspace references. A superadmin can bulk-confirm a whole tier after sampling 20.
**What a merge does, in one transaction:** fills the survivor's empty fields from the loser (never overwrites, as in doc 24); unions the lists (sectors, stages); keeps both sources; moves the loser's people to the survivor (firm merge) or their references to the survivor (person merge) through the registry; writes the alias and the merge record; hides the loser; recomputes hashes, embedding and normalised fields for the survivor. Conflicting values (two different websites) are kept as the survivor's and listed in the merge record for review rather than chosen silently.
**Auto-merge of certain people** runs only behind the platform flag `directory_auto_merge` (off at first), writes the same merge records, and is capped per run.
**Undo** within 90 days restores the loser, the references and the fields that were filled, if the survivor's fields have not since been edited by hand; otherwise it restores the references and reports the fields it could not roll back.
**Erasure and withdrawal still win.** If a person is erased or a source withdrawn (doc 54), the survivor loses the facts that came from it; a tombstoned person is never the survivor of a merge.

## 7. Imports use the decisions (slice E4)
`import-directory-drop.mjs` and the CSV importer resolve an incoming row through aliases first (an old id lands on the survivor), then through `distinct` decisions (a remembered *not the same* is never matched again), and add new look-alikes as candidates rather than creating a second record silently. The import report gains "added as candidates for review".

## 8. Workspace view
Where a workspace searches the directory, results are already collapsed for display by `dedup.ts`; once merges exist this becomes a fallback only. A saved list or CRM entry pointing at a loser keeps working through the alias.

## 9. Tests
Detection: each rule on a fixed fixture with the cases found by hand (Kindred merges; Startupbootcamp is hierarchy; the four family offices are *possible* and not *probable*); tiers; indexes keep a 21,000-firm fixture inside a time budget; a `distinct` decision is not proposed again. Merge: fills empty only; conflicts are listed; every registry column is re-pointed (the coverage tests fail for an unclassified column); a failure rolls back completely; undo restores references and fields; an alias resolves an old id; a tombstoned person cannot survive; a merge that touches a workspace copy changes only its pointer. Auto-merge: certain people only, off by default, capped. Imports: an incoming row for a merged record lands on the survivor; a remembered distinct pair is not merged; new look-alikes become candidates. Queue: the possible tier is hidden by default; roles and reasons; every action audited without personal data.

## 10. Slices
- **E1, detection and the queue (read only):** tables, detector, SAIL page with the evidence, the three decisions recorded (no merge yet). Gives the founder the real count of true duplicates and teaches us the false-positive rate before anything is changed.
- **E2, person merge** with the reference re-pointing, aliases, undo; auto-merge of certain people behind a flag.
- **E3, firm merge and hierarchy**, with the firm registry and its coverage test.
- **E4, imports** consult aliases, decisions and candidates.
Each slice is tested and deployed alone. E1 changes no directory data.

## 11. Decisions for the founder (defaults chosen; change any)
1. **Who reviews.** Default: the founder, in SAIL, in batches (the queue is ordered so the first 100 decisions settle the largest clusters).
2. **Auto-merge** of people with the same email or profile and a compatible name: default **on after the first sample is confirmed**, off until then. Firms never.
3. **Hierarchy is modelled** (one level, parent brand with programmes): default yes.
4. **Undo window** 90 days.
5. **Start now or wait.** Doc 37 puts this after the partners show duplicates hurting a real run, and they have no contacts yet (so the trigger is not met). Default: build E1 only now (it changes nothing and measures the problem) and decide on E2 to E4 after you have reviewed the first hundred candidates.

## 12. Not in scope
The cross-type `entities` graph (LPs, deals, companies, funds); per-field provenance and freshness scoring (doc 37 5.3, later); merging a workspace's own CRM records with each other (a product feature for customers); machine-learned matching (the rules plus human decisions are the training data for it later).

## 13. Build status
**E1, detection and the queue (2026-10-16), built, tested and live** (migration `2026-10-16f-directory-candidates`). It changes no directory data.
- `directory_candidates` (ordered unique pairs, tier, score, the detector's suggestion, facts-only evidence, status, who decided and why) and the flag `directory_auto_merge` (off, unused until E2). Person candidates are deleted with an erased person (the doc 54 removal routine).
- **Detector** (`lib/directory/candidates-core.ts`, pure): proposes **pairs, never clusters**. Reading the production clusters showed why: one acronym record ("FFO") joined four different family offices to each other. Firm evidence: a shared name key (own or stated former name), a shared real website with one name beginning with the other (proposed as *related*, not *same*), an acronym beside the full names it spells (possible only, and nothing at all when it fits more than 3), and people who sit at both firms. A block of more than 12 records proposes nothing. No firm pair is ever `certain`. People: same email, same personal profile, or same name at the same firm; `certain` needs a compatible name and a non-team mailbox (a mailbox such as info@ or invest@ is only `possible`).
- **Run on production on 2026-10-16** (3.9 seconds for 21,024 firms and 50,074 people): **firms 1,424 probable and 882 possible; people 81 certain, 1,710 probable, 141 possible.** The top probable firm pairs are genuine duplicates (Canaan Partners and Canaan, Upfront Ventures and Upfront, FourCities Capital and Four Cities Capital). The detector's *related* suggestions find programmes (Microsoft Accelerator and its London, Beijing and Paris programmes). One it misreads: "StartCo" and "Start Co." is suggested as *related* and is the same firm; the reviewer settles it.
- **Nightly job** `directory-identity` (02:30 UTC) and `POST admin/directory-identity` for "run now". An open pair no longer found goes stale; a stale pair found again reopens; a decided pair (`same`, `distinct`, `related`, `merged`) is never touched by a run.
- **SAIL, Data, Directory identity:** firms or people, by status; certain and probable by default with the noisy tier behind a link; both records side by side with the evidence in words; decisions Same, Not the same, Related (naming the parent); reopen with a reason. "Same" is recorded as confirmed and waits for E2: **nothing is merged**. The audit holds record ids and the decision, never names.
- 21 tests in Anker (suite 1,724), including a 21,000-firm input inside a time budget, and 7 in SAIL (170).
