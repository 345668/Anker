# 03 — CRM, outreach, LinkedIn and the assistant as per-persona entities

**Date:** 2026-09-21 · **Status:** design · **Depends on:** the scope key
(doc 00) · **Spine:** [00-persona-isolation.md](00-persona-isolation.md)

Four entities, one mechanism. They are in one document because specifying the
same `scope_key` migration four times would hide the differences that actually
matter — and the differences are per entity, at the end of each section.

Requirement: a founder's CRM and a VC's CRM are different entities. Same for
outreach, LinkedIn and the assistant. Nothing shared, nothing carried over.

---

## 0. The shared mechanism

For each table:

```sql
ALTER TABLE <t> ADD COLUMN IF NOT EXISTS scope_key text;
-- backfill: unambiguous users only (doc 00 §3)
UPDATE <t> SET scope_key = 'org:' || m.org_id FROM memberships m
 WHERE m.user_id = <t>.user_id
   AND (SELECT COUNT(*) FROM memberships m2 WHERE m2.user_id = <t>.user_id) = 1;
UPDATE <t> SET scope_key = 'unassigned:' || user_id WHERE scope_key IS NULL;
ALTER TABLE <t> ALTER COLUMN scope_key SET NOT NULL;
CREATE INDEX IF NOT EXISTS <t>_scope_idx ON <t> (scope_key, created_at DESC);
```

And in code, exactly one way to obtain the key:

```ts
const scope = await requireScope()   // 'org:<id>' — derived, never from the client
```

Every read and write filters on it. `user_id` stays for *authorship*
("who created this row") and stops being used for isolation.

That distinction is the point of the whole exercise: today `user_id` does both
jobs, and a column that means two things cannot be tightened for one of them.

---

## 1. CRM

**Tables:** `crm_boards`, `crm_entries`, `crm_saved_views`, `crm_tasks`
**Current scoping:** `org_id` **and** `user_id`
**Current isolation:** already correct

CRM is the one that is not broken. Because a workspace has one persona and
these tables carry `org_id`, a founder's CRM and a VC's CRM are already
different rows.

### What still changes

- **The route** (doc 02): `/founder/crm` and `/vc/crm` rather than one shared
  `/dashboard/crm`, so the URL says which entity it is.
- **Default board shape per persona.** A founder's pipeline tracks *investors*
  through a raise; a VC's tracks *LPs* through a fund close, and a third will
  track *GPs* for an LP workspace. Today the page branches internally. With
  separate routes, each persona seeds its own default columns at workspace
  creation and the branching goes away.
- **`scope_key` for consistency**, derived from `org_id`. Not strictly needed,
  but eleven tables filtering one way and four filtering another is how the
  next gap gets introduced.

### Per-persona defaults

| Persona | Board tracks | Default stages |
| --- | --- | --- |
| founder | investors in a round | Researching → Intro → Pitched → Diligence → Term sheet → Closed |
| vc | LPs in a fund | Sourced → Qualified → Meeting → Data room → Soft circle → Committed |
| lp | funds / GPs | Watchlist → First meeting → Diligence → IC → Committed → Re-up |

---

## 2. Outreach

**Tables:** 11 (`outreach_campaigns`, `_messages`, `_replies`, `_templates`,
`_events`, `_campaign_members`, `_campaign_schedules`, `_crawl_queue`,
`_reply_deliveries`, `outreaches`, plus `campaign_*`)
**Current scoping:** `user_id` only — **no `org_id` at all**
**Current isolation:** none across personas

This is the largest leak. A user who is both a founder and a VC has one
outreach pool: the same campaigns, templates, reply inbox and suppression list
across both roles. A VC's LP-fundraising sequence and a founder's
investor-outreach sequence are the same rows.

### Changes

- `scope_key` on all 11, per §0.
- Every query in `lib/campaign/*` and `app/dashboard/outreach/*` filters on it.
- **Templates do not cross.** A founder template is invisible in a VC
  workspace. Copying is an explicit action, later.
- **Sending identity is per scope.** Which is also a deliverability argument:
  a single sending domain used for two unrelated outreach programmes is a
  reputation risk independent of any privacy concern.

### The suppression list is the exception

`email_suppressions` (and LinkedIn's equivalent) must **not** be scoped.

If someone asks not to be contacted, that applies to the person who asked, not
to a workspace. Scoping suppression per persona would mean an unsubscribe in a
founder workspace does not stop a message from the same user's VC workspace —
which is both wrong and, under GDPR and CAN-SPAM, a compliance failure rather
than a product quirk.

**Suppression stays global per user, deliberately, and this exception must be
written down beside the table.** It is exactly the kind of "inconsistency"
someone tidies up later without knowing why it was there.

### The approval gate is unchanged

Nothing here weakens it. Outreach is never auto-sent; per-persona scoping
changes which queue a draft lands in, not whether a human releases it.

---

## 3. LinkedIn

**Tables:** `linkedin_senders` (user-scoped), `linkedin_connections` and
`linkedin_mutuals` (**no scoping at all**), plus `linkedin_campaigns`
**Current isolation:** none

`linkedin_connections` and `linkedin_mutuals` carry neither `org_id` nor
`user_id` — they are global tables. Whatever is in them is visible to any query
that reads them.

### Changes

- `scope_key` on senders, campaigns, leads, the unibox and the review queue.
- **`linkedin_connections` / `linkedin_mutuals` need a decision, not a
  default.** A connection graph is a property of the *LinkedIn account*, which
  belongs to a person, not to a workspace. Two readings:

  - **Scope to the sender account.** The graph belongs to the account that
    produced it; both personas may read it if both use that account. Correct
    modelling, and it leaks the fact that the same person operates both.
  - **Scope to the workspace.** Full isolation, at the cost of re-ingesting the
    graph per workspace and storing it twice.

  **Recommendation: scope to the sender account, and make the account itself
  per-persona.** A founder workspace and a VC workspace each connect their own
  LinkedIn sender; the graph then follows the sender and never crosses, without
  duplicating a graph for one account.

  This is the one place where the user's requirement ("LinkedIn exclusive per
  persona, not shared") and the underlying reality (one human, one LinkedIn
  profile) genuinely conflict. The resolution is that the *entity* is
  per-persona; if someone attaches the same LinkedIn account to two workspaces,
  they have chosen to blur that themselves, explicitly.

- **Suppression global**, as for email and for the same reason.

### Extension tokens

`extension-tokens` mint a credential for the browser extension. These must be
per scope: a token issued in a founder workspace must not act in a VC one.

---

## 4. The Anker assistant

**Tables:** `anker_chats` (user-scoped)
**Current isolation:** none — one history spanning every persona

The assistant is different from the other three: it is not only data at rest,
it is *a thing that reads everything else*. Scoping the chat history without
scoping what the tools can reach would be theatre.

### Three layers

1. **History.** `scope_key` on `anker_chats`. A founder's conversations are not
   listed, searched or resumed in a VC workspace.
2. **Tools.** `lib/assistant/registry.ts` resolves a tool set per persona
   already, intersected with the caller's allowlist — `toolsFor(persona)`. This
   is the part that is already right, and the scope key makes the *data* those
   tools reach match the persona they were chosen for.
3. **Context.** `AiPrincipal` carries `scopeKey` today and it is checked
   against the client's copy on every request (the 409 in
   `app/api/assistant/route.ts`). Every tool query must filter on the
   principal's scope rather than its `userId`.

### Per-persona identity

Beyond isolation, the requirement implies the assistant *is* a different
assistant:

| Persona | Framing | Default tools |
| --- | --- | --- |
| founder | raising a round, running a company | investor research, deck critique, cap table, data room |
| vc | deploying a fund, serving LPs | deal screening, portfolio, LP matching, fund reporting |
| lp | allocating into funds | fund diligence, commitment tracking, GP research |

The role prompt is selected per persona (`skills/models/*.md` already exists as
a mechanism for exactly this), and the model tier can differ per persona once
the surface dimension from the assistant architecture lands.

### Interaction with the model-routing work

[`assistant-model-architecture-2026-09-21.md`](../assessments/assistant-model-architecture-2026-09-21.md)
proposes a `surface` dimension (chatbot / assistant / copilot / batch). Persona
is **orthogonal** to surface: the routing key becomes
`(surface, persona, task)`. Doing the two independently is fine as long as both
end up in the same config object rather than two parallel ones.

---

## 5. Sequencing

Outreach first — largest leak, clearest boundary, and it is the entity where
"shared across personas" is most obviously wrong.

1. **Scope-key infrastructure** — `requireScope()`, the column on all tables,
   backfill, `unassigned:` for ambiguous users. No behaviour change.
2. **Outreach** — 11 tables, the campaign engine, the reply inbox. Keep
   suppression global.
3. **LinkedIn** — senders, campaigns, leads, extension tokens; decide the
   connection graph per §3.
4. **Assistant** — history, then tool-level scope enforcement.
5. **CRM** — smallest, already isolated; per-persona board defaults.
6. **Routing** (doc 02) once the data is actually separate.

Each step ships on its own and leaves the platform working.

## 6. Risks

- **A missed query is a silent leak**, and it fails open: a query still
  filtering on `user_id` returns *more* rows, not fewer, so nothing errors and
  nobody notices. Mitigation: after each entity is migrated, grep its module
  for `user_id` and justify every remaining use as authorship rather than
  isolation. A test that seeds two workspaces for one user and asserts each
  sees only its own rows is worth more than any amount of review here.
- **The `unassigned:` bucket.** Rows nobody claims stay invisible forever
  unless the reconciliation screen is built. It must be built, not deferred
  indefinitely, or the data is effectively deleted without anyone deciding to
  delete it.
- **Suppression is the one thing that must stay shared.** The natural instinct
  while scoping eleven tables is to scope the twelfth too.
