# 07 — LP persona: audit and implementation plan

**Date:** 2026-09-21 · **Persona:** lp · **Method:** as
[doc 05](05-founder-persona-audit.md) · **Status:** analysis

Shorter than the other two, and more severe, as expected.

> The LP persona is **five nav routes over four pages**, and every one of them
> shows an LP *someone else's* data. There is no LP workspace, no LP CRM, no LP
> outreach, and no way for an LP to arrive on the platform except by being
> invited into a fund. The founder and VC audits found missing records under
> working features. This one finds a persona that exists only as a guest.

All five routes resolve. Nothing is broken in the ordinary sense here either;
what is missing is the persona.

---

## 1. The surface, entirely

| Route | Page | What it shows |
| --- | --- | --- |
| `/lp` | overview | commitment / called / distributed / uncalled per fund the LP is in, plus documents |
| `/lp/distributions` | capital activity | calls and distributions for those funds |
| `/lp/documents` | documents | data-room documents those funds shared |
| `/lp/calls` | call intelligence | recorded calls |
| `/dashboard/assistant`, `/dashboard/anker-ai` | shared with founder and VC | — |

Every data page resolves through `getLpMembershipsForUser()` — the funds that
invited this LP. **Nothing on the LP surface belongs to the LP.**

---

## 2. Findings

### L1 — An LP cannot arrive on the platform on their own *(highest)*

Established in [doc 01](01-lp-workspace-provisioning.md): onboarding accepts
`founder | vc` and returns **400 "Invalid path"** for `lp`.

The LP-side consequence completes the picture. `app/lp/page.tsx` notes:

> *"Layout already shows the 'no LP access' stub when memberships is empty."*

So a self-registered LP — a family office evaluating funds, an endowment
running diligence — signs up, cannot onboard, and lands on a stub telling them
they have no access. **There is no path from sign-up to value.** Every LP on the
platform today is there because a GP put them there.

Against [doc 04](04-personas-entitlements-and-billing.md): the LP persona is
meant to be a paid product with Starter / Growth / Scale tiers. Today there is
nothing to buy — the only LP experience that exists is LP Free (guest), and
there is no way to be anything else.

### L2 — LP actions are unaudited, and the code says they do not exist *(record keeping)*

`app/lp/page.tsx` says:

> *"Both pieces are read-only. When LPs need to act (submit a sub doc back,
> acknowledge a capital call), that's a separate flow we'll add later."*

That comment is **stale**. `app/api/lp/acknowledge/route.ts` exists, is wired
into `components/lp/lp-activity-client.tsx`, and lets an LP:

- acknowledge a capital call — **intent to wire**;
- confirm receipt of a distribution;
- undo either.

It is correctly authorized ("the line item must belong to a fund_lp the
signed-in user is attached to… No cross-LP writes"). It calls `logAudit` **zero
times.**

An LP acknowledging a capital call is the LP's side of a money movement. If a
wire goes missing and the question is "did the LP confirm, and when, and did
they later undo it", the platform holds the current state of a flag and no
history of it. `undo` makes this sharper: an acknowledgement that was given and
withdrawn is indistinguishable from one never given.

(Submitting subscription documents back — the other half of the comment — does
genuinely not exist.)

### L3 — The LP's own access is unrecorded in the app *(record keeping)*

From [doc 06](06-vc-persona-audit.md) V2 and V3, seen from the LP's side:

- `logDocumentView()` is defined and **never called**, so no LP document open
  is recorded anywhere;
- the token portal records access through `logPortalAccess()`, the signed-in
  `/lp/*` app does not.

An LP has a legitimate interest in the record of what they were shown and when
— it is their evidence that they received a notice. Today it exists for LPs who
use a magic link and not for LPs who sign in.

### L4 — Identity is an email address *(security)*

`getLpMembershipsForUser(user.email ?? "")` resolves LP membership by the
**contact email** on a `fund_lp` record, not by a user id.

Checked and fine: an empty email is guarded —
`getLpMembershipsForEmail` returns `[]` when the trimmed value is empty, so a
null email cannot match rows with blank contact fields.

Not fine, and inherent to the design:

- **An email change loses access.** An LP whose firm changes domain stops
  seeing their funds until a GP edits the contact record.
- **A shared inbox shares access.** `ir@familyoffice.com` given to three
  people means three people see the same capital account, with no way to tell
  them apart in any record.
- **The fund controls the LP's identity.** Whoever edits the `fund_lp` contact
  email decides who can see that LP's capital account.

The acknowledge route authorizes the same way ("attached to by contact email"),
so the money-movement write inherits all three.

### L5 — Owner oversight reads every LP across every fund *(security — decision needed)*

`lib/portfolio/data-room.ts:504`:

```ts
if (isOwner(email)) return { memberships: await getAllLpMemberships(), oversight: true }
```

The platform owner sees every LP's commitment, called capital, distributions,
NAV share and documents, across every fund on the platform, with a UI banner.

**This is deliberate and documented** — the comment at line 472 says *"Every LP
across every fund — for platform-owner oversight of the portal"* — so it is a
policy, not a bug. It is flagged because it appears to conflict with a stated
principle: my working notes record the owner tier as *"firewalled from tenant
private records"*, and an LP's capital account is about as private as a tenant
record gets.

Two things are true regardless of which way the policy goes:

- **The oversight read is not audited.** A cross-tenant read of financial
  records by a privileged account is the canonical case for an access log, and
  there is none.
- **It is the fallback, not a mode.** An owner who is *also* an LP in a fund
  (case 6 in doc 04 — a GP who is an LP elsewhere) sees only their own
  memberships, because `own.length > 0` returns first. The oversight view
  silently disappears the moment the owner becomes an LP anywhere. That is
  probably not intended in either direction.

**Needs a decision:** either the owner is firewalled and this path goes, or the
owner has oversight and it becomes an explicit, audited mode rather than an
email fallback.

### L6 — The assistant has nothing to be an LP assistant about *(missing implementation)*

LP navigation includes both shared assistant routes. The assistant resolves a
tool set per persona and scopes by `scopeKey`, which for an LP without a
workspace is `lp:<userId>` (`lib/assistant/principal.ts:23`).

With no LP workspace, no LP CRM and no LP pipeline, an LP assistant can answer
questions about the funds that invited them and nothing about the LP's own
allocation work. Per [doc 03](03-persona-scoped-entities.md) §4 its framing
should be *"allocating into funds"*; the data for that does not exist yet.

### L7 — No LP CRM, outreach or LinkedIn *(missing implementation)*

An LP evaluating GPs runs a pipeline — watchlist, first meeting, diligence, IC,
commit, re-up — and does outreach to GPs. None of it has a surface. Doc 03 §1
gives the LP board shape; it depends on L1 being solved first, since there is
no workspace to scope it to.

---

## 3. Day-to-day: an allocator's year

**Continuously — diligence.** Track GPs, take meetings, request data rooms,
compare funds. *Nothing on the platform supports this today.* The matching
engine runs fund → LP; the reverse (LP → fund) is not exposed.

**On notice — capital calls.** Receive a notice, acknowledge, wire. *Receipt and
acknowledgement work.* The acknowledgement is not recorded (L2).

**On distribution.** Confirm receipt, record tax character. *Works, unrecorded.*

**Quarterly — reporting.** Read LP letters and capital account statements. *Works
through the invited funds' data rooms.*

**Annually — re-up and allocation.** Decide which GPs to back again, model the
allocation. *Nothing supports this.*

The pattern: **the platform serves the LP as the fund's counterparty, and not at
all as an allocator.** Every working piece is the receiving end of something a
GP does.

---

## 4. Implementation plan

### Phase 1 — Records for what LPs already do (L2, L3)

1. `logAudit` on `/api/lp/acknowledge`: kind, line, acknowledged or undone,
   actor, timestamp. History, not a flag.
2. Call `logDocumentView()` (shared with doc 06 phase 2).
3. Record signed-in `/lp/*` access equivalently to `logPortalAccess()`.
4. Delete the stale comment in `app/lp/page.tsx`, which tells the next reader
   that a working feature does not exist.

### Phase 2 — The oversight decision (L5)

5. Decide the policy. Then either remove the fallback, or make oversight an
   explicit mode that is audited on every read and does not vanish when the
   owner is also an LP.

### Phase 3 — Make the persona exist (L1, L6, L7)

6. [Doc 01](01-lp-workspace-provisioning.md): LP onboarding and the
   `allocator` workspace kind.
7. Scoped LP CRM with the allocator board from doc 03 §1.
8. **LP → fund discovery**, the reverse of the matching engine that already
   runs fund → LP.
9. LP assistant framing and tools per doc 03 §4.

### Phase 4 — Identity (L4)

10. Bind `fund_lp` to a user id once the LP has an account, keeping the email as
    the invitation route rather than the permanent key. An LP's access should
    survive their email changing, and a shared inbox should become separate
    identities.

---

## 5. Risks

- **Phase 3 is most of a product.** It is the right order — records for what
  exists first, then the persona — but it should be scoped against doc 04's
  LP tiers so the first LP workspace ships with something worth paying for.
- **L4's fix changes who can see an LP's capital account.** Moving from email to
  user id must preserve every current LP's access through the transition, or it
  becomes an access outage for the funds' investors — the people a GP least
  wants to call about a platform migration.
- **L5 is a policy question with a security answer either way.** Deferring the
  decision leaves an unaudited cross-tenant read of financial data in place.

---

## 6. Across the three audits

| | Founder | VC | LP |
| --- | --- | --- | --- |
| Routes / missing | 31 / 0 | 36 / 0 | 5 / 0 |
| Broken links, TODOs, placeholders | none | none | one stale comment |
| Unaudited legally-significant writes | equity: grants, 409A, filings | fund ops: calls, distributions, KYC, disclosure | capital-call acknowledgement |
| Failed implementation | Gmail inbound | `logDocumentView` never called | same |
| Workflow gap | match → CRM | match → LP pipeline | no allocator workflow at all |
| Isolation | shared outreach / LinkedIn | shared, and higher stakes | no entities to isolate |
| Distinctive | open outreach loop | evidence after the fact | persona exists only as a guest |

The common thread across all three: **the platform records what things are and
almost never what they were.** Six `logAudit` call sites serve three personas
whose day-to-day work is producing records — a cap table, a capital account, an
AML decision. Fixing that is one change repeated in about fifteen modules, and
it is the change most likely to be deferred because no user will ever see it.
