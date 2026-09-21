# 06 — VC persona: audit and implementation plan

**Date:** 2026-09-21 · **Persona:** vc · **Method:** as
[doc 05](05-founder-persona-audit.md) — every route resolved, every link
checked, mutation paths traced to their audit trail · **Status:** analysis

The VC surface is **36 routes across six work areas**, the largest of the three.
As with the founder audit, nothing is broken in the ordinary sense.

> **0 of 36** nav routes missing. No dead links, no `TODO`s, no placeholder
> data. What is missing is the **record layer under a regulated business** —
> and one feature that exists in full except for the line that would make it
> work.

The founder audit found unaudited equity records. The VC audit finds the same
shape applied to money movement, LP disclosure and AML — where the audit trail
is not good practice but the deliverable itself.

---

## 1. Findings

### V1 — Fund operations mutate without an audit trail *(highest)*

Every one of these writes, and every one calls `logAudit` zero times:

| Module | What it changes | Why a trail matters |
| --- | --- | --- |
| `lib/portfolio/capital-calls.ts` | capital call notices | an instruction to LPs to wire money |
| `lib/portfolio/distributions.ts` | distributions | money returned, and its tax character |
| `lib/portfolio/lp-quarterly-report.ts` | LP quarterly reports | the fund's formal statement to investors |
| `lib/portfolio/information-sharing.ts` | **per-LP disclosure matrix** | who may see what |
| `lib/portfolio/syndication.ts` | syndicate allocations | who got how much of a deal |
| `lib/portfolio/funds.ts` | fund records | the entity everything hangs off |
| `lib/modules/kyc.ts` | `kyc_cases`, `kyc_documents`, `kyc_screening_hits` | a regulated obligation |

Three of these deserve singling out.

**KYC/AML.** For anti-money-laundering, the record of *what was checked, when,
by whom, and what was decided* **is the compliance artefact**. A screening hit
that was reviewed and cleared with no record of who cleared it is, for
examination purposes, not cleared. `lib/modules/kyc.ts` writes screening hits
and case documents with no audit entry at all.

**The disclosure matrix.** `information-sharing.ts` describes itself as *"the
visible control plane for the LP data firewall"* — it decides, per LP, whether
they see the statement of investments, deal IRR, fund performance and capital
account. **Changing who can see what is a permission change**, and permission
changes are the canonical thing an audit log exists for. Today one can be
widened and narrowed again with no trace.

**Capital calls and distributions** are instructions about money. A dispute
about what a notice said, or when it changed, currently has no authoritative
answer inside the platform.

There is *some* history discipline in this area —
`lib/portfolio/fund-assessment-history.ts` exists and keeps prior assessments —
which shows the pattern is understood. It simply has not been applied where the
consequences are highest.

### V2 — The data-room view log is written by nothing *(failed implementation)*

`lib/portfolio/data-room.ts:512` defines it properly, best-effort and
non-throwing:

```ts
/** Best-effort log of a document open. Never throws — tracking must not break
 *  the download. */
export async function logDocumentView(input: { documentId, fundId, fundLpId, viewerEmail, isLp })
```

`grep -rn "logDocumentView" lib app components` returns **the definition and
nothing else.**

The only other references to `data_room_document_views` are two `SELECT`s at
lines 342 and 358 that aggregate it into engagement statistics. So the feature
is complete in every part except the call site:

- the table exists;
- the writer exists and is correct;
- the reporting queries exist;
- **nothing ever writes a row**, so the reports read an empty table.

The consequence for a GP is a plausible-looking but always-empty answer to
*"which LPs opened the deck, and which have not"* — one of the few genuine
signals during a fund raise. The consequence for an LP is that their document
access is unrecorded (doc 07, L3).

This is the clearest "failed implementation" in the platform: not a stub, not a
TODO, but a finished feature missing one line.

### V3 — Two LP access paths keep different records *(record keeping)*

`lib/portfolio/lp-portal.ts:117` has `logPortalAccess(tokenId, lpId, path, ip)`
and it **is** called — from `/api/portal/[token]/letters/[id]` and
`/api/portal/[token]/ask`. The magic-link portal records who opened what, from
which IP.

The signed-in LP surface (`/lp/*`, via `getLpMembershipsForUser`) records
nothing.

So the same LP looking at the same fund produces an access trail through one
door and none through the other. Any report built on portal access under-counts
by exactly the share of LPs who use the app rather than the link — and nothing
says so.

### V4 — Authorization sprawl, as in doc 05 *(security)*

The VC surface leans hardest on the domain-specific access helpers:
`requireFundAccess`, `requirePortfolioAccess`, `requireActiveFund`,
`buildFundContext`, `buildGateContext`, `buildQuarterContext` — six of the 38
counted in doc 05 §S3, for one persona.

Each is correct. The finding is the same: with no choke point, coverage is
established by reading rather than by test, and the VC surface is where the
most sensitive data sits behind the most variants.

### V5 — CRM, outreach and LinkedIn are shared with the founder persona *(isolation)*

Per [doc 00](00-persona-isolation.md), the eleven `outreach_*` tables and the
LinkedIn tables are scoped by `user_id` with no `org_id`. A GP who also has a
founder workspace shares one outreach pool, one sender set and one reply inbox
across both.

For this persona the stakes are specific: **LP fundraising outreach and
portfolio-company founder outreach are different confidentiality domains**, and
an LP prospect list sitting in the same pool as a founder's investor list is
the sort of thing that is embarrassing in one direction and serious in the
other.

Addressed by [doc 03](03-persona-scoped-entities.md); recorded here because it
lands differently for a VC than for a founder.

### V6 — The LP-raise workflow has the same seam as the founder raise *(workflow)*

`/dashboard/matchmaking` runs LP matching, `/dashboard/outreach/lp-campaign`
runs LP campaigns, and `lib/campaign/interest-tokens.ts` +
`campaign_crm_entries` join campaign to CRM.

What is missing is the same join the founder audit found (doc 05, S5): a match
session does not become a pipeline. The LP side has more of the machinery —
`app/api/lp/pipeline/*` exists, with stage, firms and contacts endpoints — so
the gap is narrower here, but a matching run still hands back a workbook rather
than populating that pipeline.

---

## 2. Day-to-day: a GP's quarter

The VC persona is not a week-shaped job like the founder's. It is a quarter.

**Deal flow, continuously.** Source → screen → diligence → IC → close. The
pipeline and stage gates exist (`deal-stage-gates.ts`). Calls attach to CRM
entries and draft follow-ups, as for founders.

**Quarter end — the compressed week.** Valuations, quarterly reports, capital
account statements, the LP letter. `lp-quarterly-report.ts` and
`buildQuarterContext` exist. **Every artefact produced here is a formal
statement to investors, and none of them is audited** (V1).

**Fundraising, when open.** Matchmaking → LP campaign → pipeline →
data room → close. The seam at V6 sits in the middle of it, and V2 means the
data-room engagement signal that should tell a GP who is actually interested is
permanently blank.

**Compliance, in the background.** KYC on new LPs, filings, fund tax. Runs on
deadlines, and is the part where an examiner asks for a trail that does not
exist (V1).

The founder's friction is *carrying data between stages*. The GP's is
**producing evidence after the fact** — and the platform holds the data to
produce it while recording almost none of the changes.

---

## 3. Implementation plan

### Phase 1 — The regulated record layer (V1)

1. `logAudit` on every mutation in `kyc.ts` — case opened, document added,
   screening hit raised, hit cleared with the decision and who made it.
2. `logAudit` on `information-sharing.ts`. Every disclosure change: LP,
   category, old value, new value, actor. This is a permission change and
   should read like one.
3. `logAudit` on `capital-calls.ts` and `distributions.ts`, including issue,
   amend and send.
4. `logAudit` on `lp-quarterly-report.ts` at generation and at send.
5. History tables for capital calls and distributions, following
   `fund-assessment-history.ts`, which already demonstrates the pattern in this
   codebase.

### Phase 2 — Fix the view log (V2, V3)

6. Call `logDocumentView()` from the document open/download path. One line, and
   the engagement reports start working.
7. Record signed-in LP access the way the token portal does, so both doors keep
   the same record.
8. Backfill nothing and **say so in the UI** — engagement statistics begin from
   the date the call site lands, and a chart that silently starts at zero
   invites the reader to conclude the LPs are ignoring them.

### Phase 3 — Isolation and workflow (V5, V6)

9. Scope outreach and LinkedIn per doc 03. Highest priority for this persona.
10. Match session → LP pipeline, reusing `app/api/lp/pipeline/*`.

### Phase 4 — Authorization (V4)

11. As doc 05 phase 4: `requireScope()` replaces the domain helpers, with the
    route-coverage test.

---

## 4. Risks

- **V2 looks trivial and is not entirely.** Calling `logDocumentView()` needs
  the viewer's identity at the download path, which differs between the token
  portal and the signed-in app. Getting it wrong would attribute an LP's view
  to a GP, which is worse than no row.
- **Audit volume.** Fund operations are bursty — a capital call touches every
  LP at once. `audit_events` has no retention policy; a quarter-end could write
  thousands of rows in a minute. Check the index before, not after.
- **Phase 1 is invisible to users**, like the founder's phase 1, and will be
  the easiest to defer. It is also the one an examiner asks for.
