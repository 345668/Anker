# 25 — The CRM revamp: three CRMs from one definition layer

**Date:** 2026-09-25 · **Status:** design, nothing built · **Personas:**
founder, VC, LP · **Spine:** [00-persona-isolation.md](00-persona-isolation.md)
· **Extends:** [03 §1](03-persona-scoped-entities.md) · **Blocked for LP by:**
[01-lp-workspace-provisioning.md](01-lp-workspace-provisioning.md)

Requirement: the CRM is a separate instance per persona — one for founders, one
for VC fund managers, one for LPs — not one CRM that branches internally.

[EspoCRM](https://github.com/espocrm/espocrm) is the reference for what a real
CRM's model looks like. §7 records how it is used and the licence constraint
that decides that.

---

## 1. What exists today, measured

### 1.1 The CRM is a shortlist tracker, not a CRM

`crm_entries` (`scripts/migrations/2026-05-04-crm-entries.sql`) is one flat
table. Its shape tells you what it was for:

```
source        'lp_matching' | 'founder_matching' | 'manual'
firm_id, investor_id        → the directory row this came from
display_name, display_title, display_email, display_linkedin,
display_location, display_type, display_score, display_tier
stage         text, DEFAULT 'queued'
tags, notes, owner, board_id, research_summary
```

Rows are promoted from a matching run. `stage` is free text. The `display_*`
columns are a denormalised snapshot so a row survives its directory row being
cleaned up — a deliberate and correct choice, kept in §4.

Around it: `crm_boards` (named kanban tabs), `crm_tasks`, `crm_saved_views`.
Total UI surface is ~2,200 lines, most of it `components/crm/crm-powerhouse.tsx`
(686) and `components/tesseract/crm-workspace.tsx` (605).

What is absent, relative to any CRM: no company/organisation entity, no
first-class person, no deal with an amount and a close date, no logged
activity, no relationship between records.

### 1.2 Isolation is already correct

`scripts/migrations/2026-09-13-workspace-team-shared-records.sql` added `org_id`
to all four CRM tables, backfilled it, added workspace-identity unique indexes,
and installed triggers (`check_crm_workspace_parent`) so a child row cannot
belong to a different workspace than its parent board or entry.

Because a workspace has exactly one persona (doc 00 §2.1), a founder's CRM rows
and a VC's CRM rows are **already different rows**. This revamp must not
regress that, and it does not need to fix it.

### 1.3 LPs are locked out of the CRM entirely

`lib/crm/workspace.ts:7`:

```ts
if (scope.persona !== (scope.kind === "company" ? "founder" : "vc"))
  throw new WorkspaceError("Select a company or fund team workspace to open CRM.")
```

A company workspace must be `founder`; anything else must be `vc`. There is no
branch that admits `lp`. So "a different CRM for LPs" is not a re-skin of an
existing surface — **the LP CRM does not exist**, which is the same finding doc
07 reports for the persona generally. It also means the LP CRM inherits doc 01
as a hard prerequisite: an LP with no workspace of their own has no `org_id` to
scope rows to.

### 1.4 Four stores already hold contact-shaped data

This is the part that decides the design, and the reason this is a revamp
rather than an extension.

| Store | Scoping | Status | Rows are |
| --- | --- | --- | --- |
| `crm_entries` | `org_id` + `user_id` | **live** | shortlist rows being worked |
| `contacts` | `user_id` only | **live**, one consumer | portfolio contacts, via `app/api/portfolio/contacts/route.ts` |
| `deals` | `user_id` only | **effectively dead** | only reachable through unused exports in `lib/db/platform-queries.ts` |
| `activities` | `user_id` only | **dead** | zero queries anywhere in `app`, `lib`, `components` |
| `investors`, `investment_firms` | global | **live** | the directory — shared reference data, not per-workspace |

`deals` and `activities` date from the first migration
(`2026-04-27-platform-tables.sql`) and were superseded. `lib/db/platform-queries.ts`
is imported in three places, and only ever for `getInvestmentFirms` /
`getInvestors`; its twelve deal/contact helpers have no callers.

**The trap this sets:** a CRM revamp that introduces `crm_companies` and
`crm_people` without addressing the above leaves Anker with six overlapping
contact stores instead of five. §4 claims the dead names instead of inventing
new ones.

---

## 2. What is actually being asked for

Three CRMs that differ in the records they hold, not three skins over one
pipeline.

| | Founder CRM | VC CRM | LP CRM |
| --- | --- | --- | --- |
| Tracks | investors in a round | LPs in a fund close | funds / GPs |
| The counterparty is a | firm + partner | institution + allocator | manager + fund vehicle |
| The "deal" is | the round | the commitment | the allocation |
| Sourced from | founder matching, directory | LP matching, directory | fund discovery |
| Already exists? | yes, as a tracker | yes, as a tracker | **no** (§1.3) |

Deliberately **not** in the VC CRM: startup deal flow. A VC's inbound deal
pipeline already lives in fund operations (`portfolio_companies`, `deal_founders`,
`deal_documents`, the fund `deals` routes) with its own IC votes, memos and
documents. Duplicating it into the CRM would create two records of the same
deal, and the CRM copy would be the one that goes stale. **The VC CRM tracks
capital coming in; fund ops tracks capital going out.** That boundary is the
single most important scoping decision in this document.

---

## 3. The mechanism: a per-persona definition layer

### 3.1 Why not three implementations, and why not one with branches

The status quo is one implementation that branches on persona inside the page.
Doc 03 §1 already names the cost: "Today the page branches internally."

Three separate implementations is the obvious alternative and the wrong one:
three kanban boards, three table views, three detail panes, three sets of
filters — and every future CRM feature built three times or, in practice, once
and forgotten in the other two.

### 3.2 What EspoCRM gets right

EspoCRM does not hard-code its entities. `entityDefs` are JSON documents
describing fields, links and layouts; the application is a generic engine that
renders and validates whatever the definitions say. That is why one codebase
serves a recruitment CRM and a support desk.

**The idea worth adopting is the definition layer, not the entity list.** It is
precisely the thing that makes three genuinely different CRMs cheap, and it
turns "different per persona" from a branch into data.

### 3.3 The Anker form of it

One engine; three definitions in TypeScript, version-controlled, not
user-editable in v1.

**Stage keys are canonical; only labels vary per persona.** This is a correction
to the obvious design, and the reason is load-bearing. `crm_entries.stage` has
been free text since May and the vocabulary has already forked three ways —
`lib/crm/shortlist.ts` writes `in_diligence`, `lib/matching/v2/types.ts` uses
`diligence`, and `components/webmcp/crm-tools.tsx` offers `engaged` where the
others say `responded`. Three modules read those strings *semantically*:

| Consumer | Reads stage to |
| --- | --- |
| `lib/matching/outcome-events.ts` | emit the learned ranker's training labels |
| `lib/matching/v2/ranker-fit.ts` | score a row as positive or negative signal |
| `lib/matching/v2/founder-engine.ts` | stop re-surfacing a `queued` investor |

`outcome-events.ts` exists precisely to normalise "two stage systems … differing
stage vocabularies" onto five milestones. So a definition inventing keys like
`pitched` or `researching` would add a **fourth** vocabulary and degrade ranker
training *silently* — an unrecognised stage maps to `null`, which is not an
error, just a missing label. Definitions therefore pick from `CANONICAL_STAGES`
and re-label. "Pitched" and "Sourced" are the same column value in different
words.

```ts
// lib/crm/definitions/founder.ts
export const founderCrm: CrmDefinition = {
  persona: "founder",
  company: { one: "Firm",     many: "Firms" },
  person:  { one: "Investor", many: "Investors" },
  deal:    { one: "Round",    many: "Rounds" },
  stages: [
    { key: "queued",     label: "Researching",      kind: "open" },
    { key: "contacted",  label: "Intro sent",       kind: "open" },
    { key: "responded",  label: "In conversation",  kind: "open" },
    { key: "meeting",    label: "Pitched",          kind: "open" },
    { key: "diligence",  label: "Diligence",        kind: "open" },
    { key: "term_sheet", label: "Term sheet",       kind: "open" },
    { key: "committed",  label: "Closed",           kind: "won"  },
    { key: "passed",     label: "Passed",           kind: "lost" },
  ],
  sources: ["founder_matching", "manual", "import"],
}
```

The engine takes a definition and renders the board, the table, the filter set
and the funnel. A new persona is a new definition file.

Stage sets follow doc 03 §1, with terminal stages made explicit because a
pipeline without a lost state silently inflates every conversion metric:

| Persona | Pipeline (labels) |
| --- | --- |
| founder | Researching → Intro sent → In conversation → Pitched → Diligence → Term sheet → **Closed** / **Passed** |
| vc | Sourced → Outreach sent → Qualified → Meeting → Data room → Soft circle → **Committed** / **Declined** |
| lp | Watchlist → Reached out → In conversation → First meeting → Diligence → IC → **Committed** / **Passed** |

"Re-up", which doc 03 §1 listed as an LP stage, is deliberately absent: a re-up
is a *new* allocation into a later vintage of a fund already committed to, so it
is a second record with its own pipeline rather than a stage after committing.

`stage` stops being free text. Legacy spellings resolve through
`canonicalizeStage()`, which returns `null` rather than guessing for anything it
does not recognise — a row whose stage cannot be resolved is a migration finding
(§6 rule 1), and defaulting it to `queued` would hide exactly the rows the
migration report exists to surface.

### 3.4 Definitions are not tenant customisation

v1 ships three definitions maintained in the repo. Per-workspace custom fields
are a later feature with a migration story of their own, and building the
definition layer now is what makes that feature additive rather than a rewrite.
Saying so here prevents the definition layer from being mistaken for a
half-finished settings UI.

---

## 4. The data model

### 4.1 Four entities, one scope key

Per doc 00 §2.2, every table carries `scope_key` (`org:<orgId>`), derived
server-side by one accessor and never accepted from a client.

```
crm_companies   the counterparty organisation   (firm / institution / manager)
crm_people      a human at one                  (partner / allocator / GP)
crm_deals       the thing being pursued         (round / commitment / allocation)
crm_activities  what happened                   (meeting, call, email, note)
```

`crm_tasks` and `crm_saved_views` stay, gaining `scope_key`.

Naming: `crm_`-prefixed rather than claiming the bare `contacts` / `deals` /
`activities` names. The prefix is what makes the CRM's own store unambiguous
next to `portfolio_companies` and the fund `deals`, and it avoids a migration
that has to move the live `/api/portfolio/contacts` consumer at the same time
as everything else. §6 retires the dead tables separately.

### 4.2 The directory stays reference data

`investors` and `investment_firms` are global, shared, and large — the CSV
export of the two is 709 MB. They are **not** copied into a workspace.

A CRM record links to them and keeps a denormalised display snapshot, which is
what `crm_entries.display_*` already does and the one piece of the current
schema that should survive unchanged:

```sql
CREATE TABLE crm_companies (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  scope_key   text NOT NULL,
  org_id      text NOT NULL REFERENCES organizations(id),
  -- link to the directory, if this came from there
  firm_id     text,
  -- snapshot, so the row survives the directory row changing or going away
  name        text NOT NULL,
  domain      text,
  location    text,
  kind        text,          -- persona-interpreted via the definition
  ...
  created_by  text,          -- authorship, never isolation (doc 03 §0)
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_companies_scope_idx ON crm_companies (scope_key, created_at DESC);
```

Snapshot fields are refreshed on an explicit re-sync, never silently, so a
record a user has edited is not overwritten by a directory crawl.

### 4.3 Activities are the feature that makes it a CRM

The single largest functional gap. A `crm_activities` row is append-only:

```
kind        meeting | call | email | note | stage_change | task_done
occurred_at when it happened (not when it was logged)
subject_type / subject_id    company | person | deal
body, metadata jsonb
created_by
```

Append-only matters for the same reason doc 05 §S1–S2 flag the equity tables:
a relationship history that can be silently rewritten is not evidence of
anything. Corrections are new rows, not edits.

Email and meeting activities should be fed by what already exists — the Gmail
accounts under `/api/auth/gmail/*`, `investor_calls`, and the call-intelligence
sync — rather than typed in by hand. That integration is phase 4 (§5), not v1,
but the table is shaped for it now so it does not need a migration later.

---

## 5. Sequencing — Founder first, end to end

Per the decision to prove the pattern on one persona before the other two.

**Phase 1 — the engine and the Founder definition.** `CrmDefinition` type, the
three definition files (all three written now, so the abstraction is shaped by
three cases rather than one), and the engine rendering only `founder`. VC and
LP keep the current page.

**Phase 2 — the Founder schema and migration.** The four tables, `scope_key`,
and the `crm_entries` → `crm_companies` + `crm_people` + `crm_deals` split for
founder workspaces only. Old rows keep working because the reader is switched
per persona.

**Phase 3 — Founder cutover.** `/founder/crm` per doc 02, default stages seeded
from the definition, funnel metrics. Ship. This is the point where the pattern
is either proven or not. **Done 2026-09-25 — see §6.4.**

**Phase 4 — activity ingestion.** Gmail, calls, call-intelligence into
`crm_activities`.

**Phase 5 — VC.** Same migration, VC definition, `/vc/crm`. Enforce the §2
boundary against fund ops. **Done 2026-09-25 — see §6.5.** Phase 4 (activity
ingestion) was deferred behind it at the owner's direction.

**Phase 6 — LP.** Requires doc 01 to have landed. Admit `lp` in
`lib/crm/workspace.ts`, LP definition, `/lp/crm`.

**Phase 7 — retire the dead stores.** Drop `activities`, drop `deals`, remove
the twelve dead exports from `lib/db/platform-queries.ts`, and either fold
`contacts` into `crm_people` or document why portfolio contacts are a separate
concern. Last, deliberately: dropping tables before the replacement has carried
real traffic is how a rollback stops being possible.

---

## 6. Migration of existing rows

`crm_entries` rows split across three tables. The mapping is mechanical because
the source columns are already denormalised:

```
crm_entries.firm_id     + display_* (firm fields)   → crm_companies
crm_entries.investor_id + display_name/title/email  → crm_people
crm_entries.stage, board_id, notes, tags, owner     → crm_deals
crm_entries.research_summary / research_at          → crm_activities (kind='note')
```

Built in phase 2 as `scripts/migrations/2026-09-25-crm-entities.sql`, with
`scripts/checks/crm-entities-preflight.sql` (read-only, run first) and
`scripts/checks/crm-entities-migration-check.mjs` (applies it to a throwaway
PGlite database and asserts the split).

Four rules, in order of how much trouble they save:

1. **`stage` is mapped, never guessed.** Values not in the founder definition's
   stage set map to the nearest open stage and are **recorded in a migration
   report**, not silently coerced. A free-text column that has been writable
   since May will contain values nobody predicted.
2. **Nothing is deleted.** `crm_entries` is retained read-only until phase 7,
   with the new rows carrying `migrated_from_entry_id` so a bad split can be
   diagnosed against the original.
3. **Identity collapses internal whitespace, and the merge that causes is
   reported.** `crm_companies.identity` and `crm_people.identity` normalise a
   name with `lower(btrim(regexp_replace(name,'\s+',' ','g')))`. Trimming alone
   makes "Alpha  Capital" and "Alpha Capital" two companies, which defeats the
   only purpose a dedupe key has. Collapsing instead means two genuinely
   different records sharing a name **merge onto one**, so the preflight reports
   `merges_two_people_into_one` / `merges_two_companies_into_one` and that is a
   decision taken before the migration runs, not discovered after. Both
   expressions and the plan view must stay character-identical or the joins
   attach nothing, silently.
4. **Measure before running**, as doc 00 §3 does for `scope_key`:

```sql
SELECT stage, count(*) FROM crm_entries
 WHERE org_id IN (SELECT id FROM organizations WHERE kind='company')
 GROUP BY stage ORDER BY 2 DESC;
```

If that returns stages outside the defined set, rule 1 fires and the report is
the deliverable of the migration, not a side effect of it.

### 6.1 What the measurement found (2026-09-25, production)

Rule 4 was run. The result changes the order of the work, so it is recorded here
rather than in a commit message.

| Measure | Value |
| --- | --- |
| `crm_entries` total | **12,534** |
| in a founder workspace | **0** |
| in a fund workspace | **0** |
| `org_id IS NULL` (unmigrated private records) | **12,534** |
| `crm_boards` with an `org_id` | **0 of 3** |
| distinct `stage` values in the whole table | **`queued`, `contacted`** |

Two things follow, and they point in opposite directions.

**The stage fear was unfounded.** Four months of a free-text column with three
disagreeing writers produced exactly two values, both canonical and both in the
founder set. There is nothing to fold and nothing unmappable. The forked
vocabularies in §3.3 are real but they live in *code*, not in the data — which is
still worth fixing, because the next writer to reach the column is as likely to
write `in_diligence` as `diligence`.

**The split has nothing to operate on.** Every row has a NULL `org_id`, so the
plan view's inner join to `organizations` selects none of them. The 2026-09-13
backfill was deliberately conservative — it derived a board's workspace only from
a `fundraising_rounds` link with exactly one distinct `org_id` — and in practice
that qualified nothing. This is precisely the `unassigned:` bucket doc 00 §3 and
doc 03 §6 warned would "stay invisible forever unless the reconciliation screen is
built."

Ownership of those rows, which decides what can be done about it:

| Owner | Rows | Shape | Adoptable? |
| --- | --- | --- | --- |
| `2cf12194…` (36-char UUID, has a membership) | **627** | manual, added over 2026-06-01 → 07-11, **228 with `last_contacted_at`** | **yes**, via the existing legacy flow |
| `usr_mohm…` (21-char, pre-Supabase id, no membership, absent from `local_users`) | **11,907** | 11,625 from one `lp_matching` run on a single day (2026-05-13) + 282 manual on 2026-05-31; **0 notes, 2 contacted** | **no** — the identity does not exist in the current auth model |

So 95% of the CRM is a single day's bulk import with no engagement on it, owned by
an id that predates Supabase auth. `workspace_adopt_record` requires
`user_id = p_actor`, so nobody can claim those rows through the supported path.

**Revised order for phases 2-3:**

1. Apply this migration whenever convenient. It is safe and creates the schema,
   but it migrates **0 rows** today, and saying so prevents a green run being
   read as a successful data migration.
2. Adopt the **627** real rows into their founder workspace via
   `/dashboard/workspaces/legacy`, then re-run the migration — it is idempotent,
   so it picks them up on the second pass.
3. Decide the **11,907** separately (§9). Re-running an LP match reproduces that
   shortlist, which is the argument for treating it as archive rather than as
   data to rescue.
4. Only then is phase 3's cutover meaningful; before adoption it would move the
   founder CRM from one empty view to another.

### 6.2 Can the 627 actually be adopted? (checked 2026-09-25)

`workspace_adopt_record` and `/dashboard/workspaces/legacy` were tested against the
real rows. Every precondition passes:

| Precondition | Result |
| --- | --- |
| actor has a membership, role in (owner, admin, member) | **yes** — `workspace_owner` |
| `memberships.persona` matches the org kind | **yes**, for both of the actor's workspaces |
| org not archived | **yes** |
| entries have `board_id IS NULL` (required by `p_kind='contact'`) | **627 of 627** |
| `(org_id, source, import_key)` unique-index collisions | **0** — no 23505 aborts |
| `crm_tasks` with conflicting ownership | **0** |
| duplicate names causing a post-split merge | **none** — all 627 carry an `investor_id`, so identity is the id, not the name |

So adoption will succeed. The problems are elsewhere:

1. **It is one POST per contact**, and the listing is `LIMIT 200`
   (`app/api/org/legacy-records/route.ts`). Adopting 627 board-less contacts means
   627 confirmations across four passes of the list. The flow was built for a
   handful of stragglers, not a book.
2. **The actor owns two workspaces** — a company/founder and a fund/vc, both as
   `workspace_owner`. Adoption targets the *active* workspace, so the destination
   is a real per-record choice. Doc 00 §3 is explicit that a multi-workspace user's
   rows must not be assigned by inference, which is why this cannot simply be
   backfilled in SQL.
3. **All 627 `investor_id` values dangle** — none exists in `investors`. The
   `display_*` snapshot is the only surviving record of who these people are, which
   is the case for §4.2 keeping it. Migrated `crm_people` rows will carry a dead
   `investor_id` as provenance.
4. **All 627 have `firm_id IS NULL`**, so the split produces 627 contacts with
   `company_id IS NULL` and 627 `person_without_company` findings. That is
   accurate rather than broken, but it is a CRM of unattached contacts until
   companies are inferred. `display_email` covers only 127 (with 127 distinct
   domains, so a domain is a usable firm proxy where present); `display_linkedin`
   covers 606 and is the better route.

What the rows contain, which is the argument for bothering:

| Field | Filled |
| --- | --- |
| `display_name`, `display_type`, `why_match`, `research_summary` | **627 / 627** |
| `display_linkedin` | 606 |
| `last_contacted_at` | **228** |
| `display_title` | 132 |
| `display_email`, `display_location` | 127 |
| `tags`, `notes` | 0 |

627 researched contacts with a stated match rationale, 606 with a LinkedIn profile
and 228 actually contacted. `research_summary` on every row means the phase-2 split
also creates 627 activity notes, so migrated records open with their history.

### 6.3 Outcome (2026-09-25)

Done, in this order:

1. **Schema** — `2026-09-25-crm-entities.sql` applied, 45 statements, 0 rows split
   (nothing had an `org_id` yet).
2. **Adoption** — `scripts/oneshot/adopt-legacy-crm-contacts.mjs --apply` moved
   **627 of 627** into the founder workspace, 0 failures, with 627
   `workspace_access_events` rows. The script loops the same
   `workspace_adopt_record` the UI calls, so membership, role and persona are
   re-checked inside the database per row and every move is audited. It resolves
   the destination and **refuses to choose** when more than one candidate exists.
3. **Preflight, meaningfully this time** — no rows, with 627 in scope: 0
   unmappable stages, 0 folded, 0 ambiguous, only `queued` and `contacted`.
4. **Split** — `2026-09-25-crm-entities-split.sql` lifts the split into
   `crm_founder_split()` so a future adoption re-runs it without re-running a
   recorded migration. Result: **627 people, 627 deals, 627 activity notes, 0
   companies**, stages `queued=569 / contacted=58` matching the source exactly,
   228 deals carrying `last_contacted_at`. `crm_entries` untouched at 12,534.

The 627 `person_without_company` findings are the expected consequence of §6.2
item 4 — every row had `firm_id IS NULL`, so there was no firm to attach. Inferring
companies from the 606 LinkedIn URLs is the obvious follow-up and is not part of
phase 2.

**The founder CRM renders data again.** It had been empty since the 2026-09-13
backfill qualified nothing; `/dashboard/crm` for the "Anker" workspace now lists
627 contacts. Worth noting that workspace is the one **onboarding-provisioned**
organization (`id LIKE 'onboarding:%'`); the other nine company orgs are test
workspaces. If a deliberately-created founder workspace ever replaces it, this
data does not follow automatically.

### 6.4 Phase 3: the founder cutover (2026-09-25)

`/founder/crm` reads the entity model and takes its pipeline, labels, funnel and
empty state from `founderCrm`. Nothing in it branches on persona, which is the
property that lets VC and LP reuse it with their own definition in phases 5-6.

| Piece | Where |
| --- | --- |
| Route + 404 guard | `app/(personas)/founder/{layout,crm/page}.tsx`, `lib/auth/persona-route.ts` |
| Read / write / funnel | `lib/crm/deals.ts` |
| Write endpoint | `app/api/crm/deals/[id]/route.ts` |
| View | `components/crm/deal-pipeline.tsx` |
| Nav | `lib/nav/{taxonomy,work-areas}.ts` — founder points at `/founder/crm`, VC keeps `/dashboard/crm` |

**A new guard, not `requirePersona()`.** The existing helper *redirects* a
mismatched persona to its own home, which is the behaviour doc 02 §2 argues
against at length. `requirePersonaWorkspace()` **404s** instead. It also resolves
the requested persona's membership directly rather than trusting the active-
workspace cookie, because doc 02's "switch the active workspace and render" cannot
be done from a layout — an RSC render may not set cookies. Aligning the cookie is
left to the proxy when doc 02 lands in full; until then the page is correct
whatever the cookie says, and says so when the two disagree.

**The ranker is still fed.** `/api/crm/entries/[id]` calls
`recordStageTransition()` on every stage change. Moving writes to `crm_deals`
without that would have stopped the learned ranker receiving training labels, and
stopped it silently — the same failure §3.3 exists to prevent. `patchDeal()` calls
it, resolving `firm_id` / `investor_id` from the linked company and person since
they do not live on the deal.

**Deliberately not ported**, and linked back to `/dashboard/crm` rather than
faked: boards, saved views, bulk actions, tag editing, follow-up tasks, CSV export
and the LinkedIn import dialog. Tasks are the one that *cannot* move yet —
`crm_tasks.crm_entry_id` is a foreign key to `crm_entries`, so a task cannot attach
to a deal until that column gains a deal link. A parity pass is its own phase, and
pretending otherwise would put dead controls on the page.

**A data-quality finding, pre-existing.** 430 of the 627 `display_name` values are
longer than 60 characters (max 247) because a name and a whole LinkedIn headline
are concatenated with no separator, while only 132 rows have a `display_title`.
`crm_people.name` matches the source exactly for all 627, so the split copied
faithfully — the mangling came from whatever ingest wrote those rows. It is not
repaired here: splitting a name from a headline is a guess, and the right fix is in
the ingest plus a reviewed backfill. It does not cause merges, because identity
keys on `investor_id`, which every row has.

### 6.5 Phase 5: the VC cutover (2026-09-25)

`/vc/crm` is the same page as `/founder/crm` with a different definition. No file
reads the persona to decide behaviour — the words, the pipeline, the funnel and the
empty state all come from `vcCrm`. That reuse is the return on the definition layer,
and it is what makes phase 6 cheap once doc 01 lands.

| Piece | Change |
| --- | --- |
| Split | `scripts/migrations/2026-09-25-crm-split-personas.sql` — `crm_migration_plan` gains `persona`, `crm_split(persona)` replaces `crm_founder_split()` |
| Engine switch | `ENGINE_PERSONAS = ["founder", "vc"]` |
| Route | `app/(personas)/vc/{layout,crm/page}.tsx` |
| View | unchanged — `components/crm/deal-pipeline.tsx` |
| Nav | founder → `/founder/crm` ("Investors"), VC → `/vc/crm` ("LPs") |

**The narrowing is asymmetric, in both directions.** A founder has `term_sheet` and
no `soft_circle`; a GP has `soft_circle` and no `term_sheet`. So founder folds
`soft_circle → term_sheet` and VC folds `term_sheet → soft_circle`. Getting that
backwards would be invisible in a founder-only test, which is why the check script
now asserts both directions on the same fixtures.

**Per-workspace company identity is asserted, not assumed.** `crm_companies.identity`
is unique per `(org_id, identity)`, so the same directory firm tracked by a founder
and by a GP becomes two companies — one per workspace — and no person is ever
attached to another workspace's company. Both are checked.

**The VC CRM is empty, and that was known before the work started.** Measured first:
0 `crm_entries` in a fund workspace, and `lp_firm_matches`, `lp_contact_matches` and
`lp_match_sessions` all at **0 rows** — the LP matching pipeline has never produced
anything. There is one fund workspace and one `vc` membership. So `crm_split('vc')`
correctly moved nothing, and `/vc/crm` renders its empty state.

**The only VC-shaped data that exists is the 11,907 archived rows** (§6.1), of which
11,625 came from `lp_matching` — LP shortlist rows, which belong to a GP's pipeline
rather than a founder's. The archive decision stands, but it was taken when those
rows were framed as reproducible surplus; they are now also the sole candidate
content for this persona. Two things make reversing it harder than adoption was:
their owner has no membership, so `workspace_adopt_record` cannot claim them, and
reassigning them therefore means an explicit `UPDATE` of `org_id` outside the
audited function. That is a different class of action from the founder adoption and
should be decided as such, not slipped in.

**A vacuous preflight reads exactly like a clean one.** `crm-entities-preflight.sql`
returns no rows here, and it is right to: its checks are founder-scoped and nothing
is in scope. "No rows" means "nothing to review", which is only the same as "safe
to proceed" when something was examined. Check the denominator before believing a
pass.

---

## 7. EspoCRM: how it is used, and the licence

**EspoCRM is AGPL-3.0.** Anker is `private: true` with no `LICENSE` file and is
sold commercially. AGPL §13 obliges anyone who conveys a derivative work over a
network to offer that work's source under AGPL — which for a hosted SaaS means
Anker's source, to every user.

So the repo is used as a **clean-room reference**: its architecture is read and
learned from; no code, schema DDL, `entityDefs` JSON, or layout metadata is
copied into Anker. What §3.2 takes is the *idea* of a definition-driven engine,
which is not copyrightable, and the entity vocabulary common to every CRM since
Siebel.

This is a different situation from the precedent in `NOTICE`, and the difference
is the licence, not the intent. The portfolio-reporting adaptation was from
`345668/reporting` under **Apache-2.0**, where adapting into proprietary code is
permitted with attribution — which is why that NOTICE entry can exist at all. No
equivalent entry can be written for an AGPL project, because there is no
attribution that makes AGPL code safe to embed in closed source.

**Therefore:** no `NOTICE` entry is added for EspoCRM, because nothing of
EspoCRM's is present to attribute. If that ever stops being true, the licence
obligation attaches to all of Anker, and this section is the record of the
decision that it must not.

The one path that would use EspoCRM's code lawfully is running it as a separate
self-hosted service behind its REST API — arm's length, no derivative work. That
was considered and set aside: it means PHP and MySQL alongside a Vercel/Neon
stack, three instances, SSO, two-way sync, and two CRM user interfaces.

---

## 8. Out of scope, deliberately

- **Cross-persona sharing.** Per doc 00 §5. A user in two workspaces adds a
  record twice.
- **Per-workspace custom fields** (§3.4). The definition layer makes it
  additive; shipping it now would make v1 a settings UI.
- **Startup deal flow in the VC CRM** (§2). It lives in fund ops. Linking to it
  from a CRM record is fine and cheap; duplicating the record is not.
- **RLS.** Doc 00 §2.3 — unchanged, and for the same connection-pooling reason.

## 9. Risks

- **Six stores instead of five.** The failure mode if §4.1 and phase 7 are
  skipped. Phase 7 is the whole mitigation, and it is last, which is exactly
  when a phase gets dropped for being unglamorous. It should be a tracked
  obligation, not a closing bullet in a doc.
- **The engine over-generalises before three cases exist.** Mitigated by
  writing all three definitions in phase 1 while building only founder — a
  definition layer shaped by one persona will be wrong for the other two.
- **`stage` free-text surprises.** §6 rule 1. The migration report is the
  control; running the migration without reading it defeats it. Measured as a
  non-issue today (§6.1) — the risk is now forward-looking, from the forked
  vocabularies still present in code.
- **The 11,907 orphaned rows — decided, 2026-09-25: kept as archive.** They
  belong to a pre-Supabase id with no membership, so they are invisible to every
  persona page and unreachable by `workspace_adopt_record`, which requires
  `user_id = p_actor`. The owner's decision is to leave them in place, untouched
  and unmigrated, on the grounds that re-running an LP match reproduces the
  shortlist against a current directory and only 2 of the 11,907 were ever
  contacted. They are **not** deleted, so the decision is reversible.

  This is recorded rather than left implicit because doc 03 §6 names the failure
  mode exactly: rows nobody claims are "effectively deleted without anyone
  deciding to delete them". The point of this bullet is that someone did decide.
  A future phase-7 cleanup should read this before assuming the rows are debris.
- **LP CRM blocked on doc 01.** LP is last in §5 for this reason. If doc 01
  slips, the LP CRM slips with it, and promising the LP CRM on its own schedule
  would be promising something with an unbuilt dependency.
- **Activity ingestion is where the value is, and it is phase 4.** A CRM whose
  activities are hand-typed gets used for a fortnight. The phasing is
  deliberate, but phase 3 shipping without phase 4 following closely is the
  likeliest way this ends up as a better-looking tracker.
