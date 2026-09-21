# 05 — Founder persona: audit and implementation plan

**Date:** 2026-09-21 · **Persona:** founder · **Method:** every founder route
resolved, every internal link checked, mutation paths traced to their audit
trail · **Status:** analysis; nothing changed

First of three persona audits. The founder surface is **31 routes across six
work areas**, and the headline is not what an audit usually finds:

> There are no broken URLs, no dead internal links and no `TODO` comments
> anywhere in the founder surface. The gaps are not sloppiness. They are
> **missing seams between features that each work**, and **missing records of
> changes to data that is legally significant**.

---

## 1. What is *not* wrong

Stated first, because it narrows the search and because an audit that only
lists faults misrepresents the codebase.

| Check | Result |
| --- | --- |
| Founder nav routes with no page | **0 of 31** |
| Unresolved internal links (`href` / `redirect` / `push`) across `app` + `components` | **0 of 80** distinct targets |
| Genuine `TODO` / `FIXME` comments | **0** (46 matches were HTML `placeholder=` attributes) |
| Lorem ipsum / dummy data | **0** |
| Native tools shipped | **17 of 18** |

The one `"coming soon"` on a user-facing page is
`app/newsroom/[slug]/page.tsx:189` — *"Full article content coming soon"* — and
the newsroom is not a founder surface.

---

## 2. Findings

Ranked by consequence.

### S1 — Equity records are written with no audit trail *(security + record keeping, highest)*

`lib/modules/carta-modules.ts` inserts into seven tables:

```
spvs · option_grants · valuations_409a · equity_filings · loans · contracts · comp_bands
```

`grep -c logAudit lib/modules/carta-modules.ts` → **0**.

Platform-wide there are **6 `logAudit` call sites**, covering integration keys,
fund updates, share plans, acting-as-user and admin user changes. Cap table,
409A valuations, equity filings, compensation bands, contracts and loans have
none.

**Why this is not a tidiness point.** These are the records a founder is asked
to produce under scrutiny:

- **409A valuations** support the safe harbour that makes option strike prices
  defensible to the IRS. A valuation whose history cannot be reconstructed is
  weaker evidence than one that can.
- **Option grants** feed cap-table maths, ASC 718 expense and every future
  round's dilution. A grant that changed with no record of who changed it or
  when is a diligence finding.
- **Equity filings** have statutory deadlines.

The tables record `created_by` on insert, which answers "who first created
this" and nothing else. There is **no record of updates and no record of
deletes**.

### S2 — Equity tables have no history and no soft delete *(record keeping)*

No `*_history` or `*_versions` tables exist. `option_grants` has neither
`updated_at` nor `deleted_at`.

So an option grant can be edited or removed and the previous state is
**unrecoverable** — not merely unattributed. Combined with S1, a cap table can
be changed with no trace that it ever held anything else.

For a company that will one day be acquired or audited, this is the single
most consequential gap in the founder surface.

### S3 — Authorization is spread across 38 different helpers *(security)*

`lib/` exports **38** distinct access/scope functions:
`requireUpdateWorkspace`, `callScope`, `requireCrmWorkspace`, `matchingContext`,
`requireFundAccess`, `requirePortfolioAccess`, `extensionWorkspace`,
`founderContext`, `requireActiveFund`, `requireCrmEntry`, `requireAdmin`,
`requireAiPrincipal` … each correct in its own module.

The finding is **not** "routes are unauthenticated". A first pass flagged 200
of 384 mutating routes; checking them showed the pattern-matching was wrong,
not the code — `/api/updates` uses `requireUpdateWorkspace`, `/api/calls` uses
`callScope`, and so on. *That is the finding.*

**Coverage cannot be verified by inspection.** With 38 entry points and no
single choke point, the only way to know whether a new route is authorized is
to read it. There is no test that asserts every mutating route resolves a
workspace before it writes, and nothing stops the next route from resolving
none.

This compounds with doc 00's scope key: the plan is to add a 39th concept
(`requireScope()`). It must **replace** helpers rather than join them, or the
isolation guarantee inherits the same unverifiability.

### S4 — Inbound email replies do not work for Gmail *(bottleneck)*

`lib/email/inbox-sync.ts:39`:

```ts
// Gmail sending + OAuth exist; inbound polling (messages.list / history) is
// not implemented yet.
providers.push({ provider: "gmail", result: { skipped: true, error: "Gmail inbound polling not implemented yet" } })
```

IMAP polling works. Gmail — which is what most founders use — can **send** but
cannot **receive**. So for a Gmail founder the outreach loop is open: sequences
go out, replies land in Gmail, and the platform never learns a reply happened.

Everything downstream degrades quietly:

- reply classification never runs;
- sequences keep sending to someone who already answered, which is the
  single most damaging outreach failure there is;
- the unibox is empty;
- `outreach_replies` stays empty, so engagement reporting under-counts.

Nothing surfaces this in the UI. A founder sees a working sequence and does not
know the loop is open.

### S5 — The founder workflow has seams, and they are manual *(workflow)*

A founder's raise is one continuous motion. The platform implements every
stage, and the joins between them are thin:

```
find-investors ──► discover ──► CRM ──► outreach ──► calls ──► updates
   (matching)      (research)   (pipeline)  (sequence)  (record)  (reporting)
       │               │            │           │          │          │
       └── manual ─────┴── manual ──┴─ partial ─┴── good ──┴─ manual ─┘
```

What is actually wired:

- **calls → CRM → outreach** is genuinely joined. `lib/calls/records.ts` stores
  `crm_entry_id` on a call and drafts a follow-up straight into
  `outreach_messages`, and it *refuses* to draft without a CRM link
  (`"Link a workspace CRM contact before creating a draft."`). That is the
  right shape.
- **campaign → CRM** exists via `campaign_crm_entries`.
- **matching → CRM is not joined.** A founder runs a match, gets a ranked
  investor list and a five-sheet workbook, and then re-enters the investors
  they care about into the CRM by hand. The export exists precisely because the
  handoff does not.

This is the largest day-to-day friction in the persona, and the one a founder
would name first.

### S6 — Matching results are a file, not a pipeline *(workflow / missing implementation)*

The founder export produces XLSX, methodology and a four-week outreach plan
(`app/api/founder/export/[sessionId]/route.ts`). The plan is a *document*
describing what to do, next to an outreach engine that could do it.

Nothing carries a match session into a campaign. The matching audit
(`docs/assessments/matchmaking-audit-2026-09-21.md`, finding O1) noted founders
have no CSV either — so the only route from "here are your 40 investors" to
"they are in my pipeline" is a spreadsheet and typing.

### S7 — `/dashboard/signals` and `/dashboard/network` are unjoined inputs *(workflow)*

Both exist and both produce investor-adjacent intelligence. Neither writes into
the CRM or suggests a pipeline action. They are read-only surfaces in a
persona whose whole job is acting on signal.

### S8 — Investor updates are not audited *(record keeping)*

`/api/updates` has five mutating files and zero `logAudit` calls. An investor
update is a **communication to shareholders**; who sent what, to whom, when
matters, and "sent_at plus a recipients table" is a delivery log, not a record
of authorship and change.

---

## 3. Day-to-day: what the founder surface should feel like

Mirroring the actual week of someone raising.

### Monday — build the list
Run matching → review → **push the ones worth pursuing straight into the CRM**
(S5), tagged with the match session so the pipeline records *why* each investor
is there. Today: export a workbook and retype.

### Tuesday — research and personalise
Open a CRM entry → see the research already attached from discover, signals and
network, rather than opening three surfaces and copying. Draft outreach with
that context. The campaign engine already personalises well; it is being fed by
hand.

### Wednesday — send and watch
Sequences run. Replies arrive **and are seen** (S4). A reply pauses the sequence
automatically — which the engine supports, and which cannot fire for a Gmail
founder because the reply never arrives.

### Thursday — calls
A call is recorded, transcribed, summarised, linked to its CRM entry and drafts
a follow-up. **This already works**, and is the model the rest should copy.

### Friday — report
Investor update drafted from the week's actual activity — calls held, stages
moved, milestones hit — rather than a blank page. Today `draftUpdate()` takes
`highlights` and `metrics` the founder types.

The through-line: **the platform has the data at every stage and asks the
founder to carry it between stages.**

---

## 4. Implementation plan

Ordered by consequence per unit of work.

### Phase 1 — Records (S1, S2, S8)

1. `logAudit` on every mutation in `lib/modules/carta-modules.ts` —
   grants, 409A, filings, comp bands, contracts, loans, SPVs.
2. `updated_at` and `deleted_at` on the equity tables; delete becomes soft.
3. `option_grants_history` and `valuations_409a_history`, written on update —
   a row per prior state, append-only, matching `audit_events`' posture.
4. Audit investor-update send and edit.

Smallest change with the largest consequence, and the one whose absence is
hardest to remediate later: history not captured cannot be reconstructed.

### Phase 2 — Close the outreach loop (S4)

5. `pollGmailInbox()` via `messages.list` / `history.list`, pushed into the
   same provider array — the file says the callers and cron need no change.
6. Until it lands, **say so in the UI**: a Gmail-connected founder should see
   that replies are not being tracked. A silent open loop is worse than a
   visible limitation.

### Phase 3 — Join the workflow (S5, S6, S7)

7. **Push to CRM** from a match session: select investors → create CRM entries
   with provenance (`match_session_id`, score, rationale).
8. **Match session → campaign**: turn the four-week plan document into a
   populated sequence the founder reviews and approves. The approval gate does
   not move.
9. Signals and network gain a "add to pipeline" action.

### Phase 4 — Authorization (S3)

10. One `requireScope()` that **replaces** the domain helpers rather than
    joining them, delivered with doc 00's scope key.
11. A test that enumerates every `app/api/**/route.ts` exporting a mutating
    method and asserts it resolves a workspace — the check that makes coverage
    verifiable instead of reviewable.

Phase 4 is last only because doc 00 must land first; it is not lowest value.

---

## 5. Risks

- **Phase 1 changes nothing a user sees**, which makes it easy to defer
  forever. It is the one that cannot be back-filled.
- **Gmail inbound needs the right OAuth scope.** If the existing grant is
  send-only, every connected founder must re-consent — a migration with a user
  action in it, and worth discovering now rather than at implementation.
- **Push-to-CRM invites duplicates.** An investor may already be in the
  pipeline from a previous session. Match on domain and name before insert, and
  prefer updating a record to creating a second one.
- **Phase 4 touches every route.** Replace helpers incrementally behind the
  test in step 11, so coverage is proven as it grows rather than asserted at
  the end.

## 6. Next

VC and LP audits follow the same method. The LP audit will be shorter and more
severe: doc 01 establishes that the persona cannot create a workspace at all,
so most of its surface does not yet exist to audit.
