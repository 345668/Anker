# Persona isolation — the shared architecture

**Date:** 2026-09-21 · **Status:** design, nothing built · **Personas:**
founder, VC, LP

This is the spine. Four of the five implementations that follow — CRM,
outreach, LinkedIn, assistant — are the same mechanism applied to different
tables, so the mechanism is specified once here and referenced rather than
repeated.

Read this first:

| Doc | Implementation |
| --- | --- |
| **00** (this) | The isolation model, the scope key, where it is enforced |
| [01](01-lp-workspace-provisioning.md) | LP workspace creation — the missing persona |
| [02](02-persona-exclusive-routing.md) | Exclusive pages, no cross-persona routes |
| [03](03-persona-scoped-entities.md) | CRM, outreach, LinkedIn, assistant as separate entities |
| [04](04-personas-entitlements-and-billing.md) | Personas as products: subscriptions, tiers, multi-persona users |
| [05](05-founder-persona-audit.md) | Founder persona audit — bottlenecks, records, security, workflow |

---

## 1. What exists today, measured

`lib/org/active.ts:13` declares three personas:

```ts
export type Persona = "founder" | "vc" | "lp"
```

`lib/org/provision.ts:5` declares two:

```ts
export type Persona = "founder" | "vc"
```

Two types with the same name, in the same codebase, disagreeing about how many
personas exist. The narrower one governs workspace creation, which is why an LP
cannot make one (doc 01).

### Scoping of the entity tables, from the live database

| Table group | `org_id` | `persona` | `user_id` | Effective isolation |
| --- | --- | --- | --- | --- |
| `crm_boards`, `crm_entries`, `crm_saved_views`, `crm_tasks` | **yes** | no | yes | by workspace |
| `outreach_*` (11 tables) | **no** | no | yes | **by user — shared across personas** |
| `linkedin_senders` | no | no | yes | **by user — shared** |
| `linkedin_connections`, `linkedin_mutuals` | no | no | no | **global** |
| `anker_chats` | no | no | yes | **by user — shared** |

CRM is already isolated, because a workspace has exactly one persona. Outreach,
LinkedIn and the assistant are not: they hang off `user_id`, so one person who
is both a founder and a VC has **one** outreach pool, **one** LinkedIn sender
set and **one** assistant history spanning both roles.

That is the leak to close, and it is a genuine confidentiality problem rather
than an untidiness: a VC's LP-outreach sequence and a founder's investor
outreach are the same rows today.

### Routing

`lib/nav/work-areas.ts` maps persona → route lists. Founder and VC point at the
**same URLs** for CRM, outreach, all nine LinkedIn pages, discover, network,
calls, decks, documents, tools, analytics and both assistants. Persona
behaviour is decided inside each page. LP gets three areas, two of which are
`/lp/*`, plus the shared assistants.

---

## 2. The model

### 2.1 One workspace, one persona

This already holds — `memberships.persona` is per membership, and a workspace
is created for a persona — and it is the foundation everything else rests on.
It is worth stating as an invariant because the rest of the design assumes it:

> A user may hold memberships in several workspaces. Each workspace has exactly
> one persona. A user acting in a workspace is acting **as** that persona, and
> can be acting as only one at a time.

The "acting as one at a time" half is what the current session model gives us
via the active workspace, and what makes a single scope key sufficient.

**Amended by [doc 04](04-personas-entitlements-and-billing.md):** personas are
also commercial products, so the active workspace now determines the persona,
the scope key AND the entitlement. They are derived from one value and switch
together, which is what stops them disagreeing.

### 2.2 The scope key

`lib/assistant/principal.ts:23` already computes one:

```ts
scopeKey: membership ? `org:${membership.orgId}` : `lp:${userId}`
```

This is the right idea and is currently used only by the assistant. **Promote
it to the platform's isolation key**, and make it persona-explicit:

```
org:<orgId>          a founder or VC workspace  (persona implied by the org)
lp:<userId>          an LP with no workspace of their own  (doc 01 removes this case)
```

Every persona-scoped row carries `scope_key`. Every query filters on it. The
key is derived server-side from the session and the active workspace, and is
**never** accepted from a client — the assistant's own comment already says
this about `AiPrincipal` and the rule generalises.

Why a single text key rather than `(org_id, persona)`:

- it is one column and one index on eleven tables rather than two;
- it covers the LP-without-workspace case, which `org_id` cannot;
- it is already computed, already threaded through the assistant, and already
  checked against the client's copy on every assistant request to catch a
  workspace switch mid-session (`app/api/assistant/route.ts`, the 409 path).

The trade: a text key is opaque to foreign keys, so `scope_key` cannot
reference `organizations(id)` directly. Mitigated by deriving it in exactly one
function and never constructing it by hand.

### 2.3 Where it is enforced

Three layers, in order of how much they can be trusted:

1. **The database.** `scope_key NOT NULL` on every persona-scoped table, plus
   a composite index `(scope_key, created_at DESC)` for the list queries every
   page runs. This is the layer that cannot be bypassed by a forgotten `WHERE`.
2. **A single accessor.** One `requireScope()` that resolves the key from the
   session and the active workspace, mirroring `requireAiPrincipal()`. Routes
   call it; nothing reads `user_id` directly for isolation again.
3. **Routing.** Doc 02. A persona reaching another persona's page is refused
   before any query runs.

Row-level security is deliberately **not** proposed. The platform uses a single
Postgres role through a serverless driver; RLS would need per-request role
switching that the connection pooling makes unreliable, and a half-applied RLS
policy is more dangerous than none because it reads as a guarantee.

### 2.4 What "separate entity" means precisely

For each of CRM, outreach, LinkedIn and the assistant, the user's requirement
is that a founder's and a VC's are different things. Concretely:

- **Different rows.** Filtered by `scope_key`, never mixed in a query.
- **Different configuration.** Sender identities, templates, board columns and
  assistant history belong to one scope.
- **No implicit copying.** Switching workspace does not carry anything over. If
  a user wants a template in both, they create it in both — an explicit copy
  action is a later feature, not a default.
- **Different URLs.** Doc 02, so a bookmark is unambiguous about which entity
  it opens.

---

## 3. Migration of existing rows

The hard part, and the reason this is a doc rather than a patch.

Existing `outreach_*`, `linkedin_*` and `anker_chats` rows have a `user_id` and
no workspace. Assigning them a scope means deciding which persona they belonged
to, for data created before the distinction existed.

**The rule: assign by the user's workspace at the time, and only when that is
unambiguous.**

```sql
-- A user with exactly one workspace: every row is that workspace's.
UPDATE outreach_campaigns c
   SET scope_key = 'org:' || m.org_id
  FROM memberships m
 WHERE m.user_id = c.user_id
   AND (SELECT COUNT(*) FROM memberships m2 WHERE m2.user_id = c.user_id) = 1;
```

For a user with **more than one** workspace the answer is not derivable, and
guessing would put a founder's outreach into a VC workspace — exactly the
confidentiality failure this work exists to prevent. Those rows get:

```sql
scope_key = 'unassigned:' || user_id
```

They are then invisible to every persona page (which filter on a real scope
key), and a one-time reconciliation screen lets the owner assign each batch to
a workspace. **Nothing is deleted and nothing is guessed.**

Expected blast radius should be measured before the migration runs, not after:

```sql
SELECT (SELECT COUNT(*) FROM memberships GROUP BY user_id HAVING COUNT(*) > 1) AS multi_workspace_users;
```

If that is zero on production, the ambiguous branch never fires and the
reconciliation screen can be deferred. The migration must still contain it,
because it will not be zero forever.

---

## 4. Sequencing across the four docs

Each step is shippable and leaves the platform working.

1. **Doc 01 — LP provisioning.** Independent of the rest, and the one place a
   whole persona is simply missing. Nothing else depends on it.
2. **Scope key infrastructure** — `requireScope()`, the `scope_key` column on
   the eleven tables, backfill for unambiguous users, `unassigned:` for the
   rest. Nothing reads it yet; behaviour is unchanged.
3. **Doc 03 — entities**, one at a time, switching each to the scope key.
   Outreach first: it is the largest leak and the clearest win.
4. **Doc 02 — routing.** Last, because it changes URLs, and changing URLs while
   the underlying queries are still user-scoped would move pages around without
   separating the data behind them — motion without progress.

## 5. Out of scope, deliberately

- **Cross-persona sharing.** A user who wants one contact in both CRMs will
  have to add it twice. Sharing is a feature with its own permission model, and
  designing it now would weaken the isolation before it exists.
- **Persona switching inside one workspace.** A workspace has one persona;
  changing it is a data-migration problem, not a toggle.
- **The LP data-room path.** `lp_memberships` and the existing invite flow keep
  working unchanged. Doc 01 adds a way for an LP to own a workspace; it does
  not remove the way LPs are invited into a fund's.
