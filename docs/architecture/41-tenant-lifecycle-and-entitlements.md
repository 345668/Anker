# 41. Tenant lifecycle, entitlements and flags

Status: design 2026-10-04, built in two phases (§9). Implements [38](38-sail-monitoring-and-admin.md) §3.6 and [37](37-anker-agentic-venture-erp.md) §5.5 (G11).
SAIL is the control plane; Anker is the enforcer and the executor. Both read and write the shared Neon database.

## 1. The problem

Plans exist (`starter`, `pro`, `scale`, with credits) and a subscription row records what was bought, but **nothing is enforced**: no `can()`, no limits, no way to
pause a workspace, no module switches, no feature flags, no maintenance mode, and no tooling for the two things a data controller must be able to do on request, **export**
a workspace's data and **erase** it. With 0 paying tenants this is the moment to build it, before pricing makes it urgent.

## 2. Principles

1. **Open by default.** A workspace with no entitlement row behaves exactly as today. Nothing is restricted until an operator sets a plan or an override. Enforcement can
   therefore ship before pricing is decided without breaking anyone.
2. **One resolver.** `effective(org)` = the plan's defaults, then the workspace's overrides, then global flags. Every check goes through `can(org, feature)`, `limitOf(org, key)` or
   `assertActive(org, action)`. No page or route reads the tables directly.
3. **Fail open on infrastructure, closed on intent.** If the entitlement lookup itself fails, the action is allowed (a database blip must not lock customers out); a *paused* or
   *offboarding* workspace is refused because an operator decided it.
4. **The firewall stands.** Staff see a tenant's plan, state, usage and counts, never its records. Export bundles are generated server-side and delivered to the **tenant's own
   owner**; staff see row counts and a status, not content.
5. **Destructive means slow and deliberate.** Erasure is: a request with a deadline clock, a dry run with counts, a typed confirmation, a fresh two-factor code, a waiting period
   (7 days, cancellable), then execution from an explicit registry of tables. Never a single click.
6. **Everything is audited**, on both sides: `company_audit_log` for staff actions, `tenant_lifecycle_events` for state changes, and the tenant's own `workspace_access_events`
   for anything staff did to their workspace.

## 3. Lifecycle

`trial` → `active` → `paused` → `active` (resume), and `active|paused` → `offboarding` → (purged). A paused workspace is **read-only for costly or outward actions**: AI runs, outreach
sends, the public intake form and document conversion are refused with a clear message, while sign-in and reading continue (a pause is usually non-payment; the customer must be able to see and
export their data). `offboarding` is a pause plus the export and erasure workflow, and shows a banner. State changes need a reason, are audited, and are reversible except purge.

## 4. Entitlements

```
plan catalogue (code: lib/entitlements/catalog.ts)   starter | pro | scale | internal | (none = open)
   features   { assistant, outreach, linkedin, matchmaking, intake, tools, fund_ops, spvs, … } boolean
   limits     { ai_credits_month, seats, outreach_sends_day, intake_submissions_month, storage_mb } number (null = unlimited)
tenant_entitlements (org_id)   plan, feature overrides, limit overrides, notes, version
platform_flags (key)           enabled, rollout_pct, description        + maintenance mode (banner, optional write freeze)
```

`can(org, "outreach")` is true when the override says so, else the plan says so, else (no plan) true. `limitOf` returns the number or null. A flag with a rollout percentage is
decided by a stable hash of the workspace id, so a workspace does not flip in and out. Results are cached 30 seconds per process.

**Enforcement points, phase 1** (each small, each one choke point): AI principal creation (lifecycle, `assistant` module, monthly AI spend against `ai_credits_month`), `sendEmail` for outreach
(lifecycle, `outreach`, `outreach_sends_day`), the public intake form and its submit (lifecycle, `intake`), document conversion (lifecycle, `tools`), and the dashboard shell (modules a plan lacks
are hidden from navigation and their routes answer with an upgrade page). Credits are *measured* against `ai_calls.cost_usd`, not yet debited from the ledger (§5.4 of doc 37 stays the plan).

## 5. SAIL surfaces

On each organization page: **Plan and entitlements** (plan, feature switches, limits, with the effective result shown), **Lifecycle** (state, reason, trial end, history), and **Requests**
(export and erasure). A new **Flags** page for platform flags and maintenance mode. Permissions: staff read; admin and superadmin change entitlements and lifecycle; superadmin only for
offboarding and erasure; erasure and offboarding also need a fresh two-factor code (step-up).

## 6. Export and erasure (phase 2)

Both execute in Anker (the registry of tenant tables lives beside the schema); SAIL calls Anker's admin API with the portal service token and shows status and counts only.
- **Export:** every table in the registry for the workspace, as one JSON bundle per table, zipped, stored in private Blob under a random path, and a time-limited link is emailed to the workspace
  owner. Staff see the row counts and when it was sent.
- **Erasure:** requested with a deadline (30 days, the data-subject clock), dry run lists rows per table, executed after the waiting period by deleting from the registry in dependency order and
  removing the workspace's Blob prefixes, then writing a tombstone (id, name hash, counts, date) so the fact of erasure is provable without keeping the data. The directory (third-party investors)
  is not tenant data and is never touched. Aggregates and ai_calls cost rows are anonymised (workspace id nulled), not deleted.

## 7. Risks and answers

| Risk | Answer |
| --- | --- |
| A wrong registry entry deletes the wrong rows | Registry is explicit and reviewed; every statement is scoped by the workspace id; dry run must match at execution time; the platform owner's workspace and any workspace on legal hold are refused |
| Enforcement locks out a paying customer | Open by default; fail open on lookup errors; pause only by an operator's act with a reason; resume is one click |
| Plan limits surprise users | Limits are measured and shown before they are enforced; the first release enforces only lifecycle and module switches that an operator sets |
| Staff reading customer data through export | Bundles go to the tenant owner; staff see counts only |

## 8. Tests

Resolver (plan, overrides, flags, rollout stability, fail-open), lifecycle transitions and who may make them, enforcement at each choke point, the audit trail, and the erasure
dry-run against a real Postgres (PGlite) with a representative schema: counts match, scoping never crosses workspaces, the owner workspace is refused.

## 9. Phases

**A (this change):** tables, catalogue, resolver, enforcement points, SAIL entitlements/lifecycle/flags screens with audit. **B:** export and erasure executor, request queue with deadline clock and step-up, tenant-visible log.

## 10. Phase A built and verified, 2026-10-04

Tables (`plan_catalog` seeded with placeholder plans, `tenant_entitlements`, `tenant_lifecycle` and its events, `platform_flags` with `maintenance`, `tenant_requests` for phase B) are in production. Anker: `lib/entitlements`
(pure resolver and rules, DB layer with a 30 s cache and fail-open, `assertAllowed`, `assertWithinLimit`, `assertSenderMayContact`, path to module map), enforced at AI runs (`withAiContext`), outreach (`assertOutreachAllowed`), the public intake form and its monthly cap, document
conversion, and the dashboard (banner for paused, closing or maintenance; an upgrade page for a module the plan lacks). A refusal reaches the user as the plain sentence, not a generic error. SAIL: `/organizations/<id>/control` (state with history, plan, per-module and per-limit overrides with the effective result
shown, reason on every change, optimistic version check), `/flags` (rollout percentages, maintenance, superadmin only), and Plan and state columns on the organizations list. Staff changes are audited and written to the workspace's own access log. Roles: staff read, admin change, superadmin offboard
and maintenance.

Verified on production with Summit Venture Studio (then restored): paused gave the banner, a refused conversion with the plain reason, and a refused AI message with the plain reason, while reading stayed open; a Starter plan hid the intake module and the deal pipeline behind "not part of your plan". All test rows removed.

Finding: with the placeholder catalogue, Starter excludes `fund_ops`, which blocks a fund's own deal pipeline. The catalogue needs a design pass (what each plan includes for a founder, a fund and an LP) before any real workspace is put on a plan; nothing is restricted until an operator assigns one.

Phase B (export and erasure executor, request queue with deadline clock, step-up two-factor) is not built.

## 11. Phase B built and verified, 2026-10-04

**Registry** (`lib/tenant/registry.ts`): 129 rules, each table classified as workspace, fund or member scope, in erasure order (children first; the workspace, its fund and memberships last); billing records are exported but retained by law; `ai_calls` is anonymised, not deleted;
secrets (tokens, API keys) are left out of exports; the investor directory, the do-not-contact lists and consent records are in EXCLUDED and can never be erased. Guards: a CI test compares the registry with a snapshot of the live schema (and fails on a table that is in neither the
rules nor the exclusions, on a rule naming a view or a typo, or on a literal id), and the nightly dependency check does the same against the live database ("Erasure registry").
**Flow** (`lib/tenant/requests.ts`): export (built, stored privately, owners emailed a sign-in-protected link valid 14 days, then deleted); erasure = dry run, typed workspace name, a fresh two-factor code (SAIL), scheduled seven days out with the owners emailed and a cancel path, executed by the
cron (`/api/cron/tenant-requests`, every 30 minutes) only after the guards and a drift check pass again, then a tombstone with no customer content. Blockers: not in offboarding, legal hold, protected list, a platform owner is a member, a live subscription. Failure partway keeps what was deleted and retries; five failures stop for a person.
**Surfaces**: SAIL `/organizations/<id>/requests` (counts and status only; superadmin starts and schedules, admins export and cancel); Anker `POST /api/admin/tenants/<org>/requests` (portal service principal only, so a signed-in admin cannot bypass SAIL's step-up).

Verified against production (not just PGlite): all 129 rules are valid SQL on the live schema and name real base tables (two real defects found and fixed this way: several `fund_id` and `user_id` columns are uuid, so every comparison casts to text; `crm_migration_plan` is a view); a dry run and an export of the Winner Capital workspace
returned exactly its four rows; a throwaway workspace with rows in twelve tables (including a fund, a deal with an evaluation, a journal entry and an LP) was erased end to end, the global row count of every registry table was unchanged afterwards except the one anonymised cost row, and the tombstone was written. Everything the test created was removed.
Not verified: the HTTP routes and SAIL screens (they need the service token and a signed-in staff session with two-factor), the blob deletion against a real store, and the emails. Member scope was verified on 2026-10-05 with a throwaway fund workspace of two members, one sole and one also in a second workspace, each with rows in outreach_campaigns, user_settings, anker_chats, sender_profiles and li_campaigns: erasure removed every row of the sole member, left the shared member's rows and the second workspace untouched, the directory (50,000 investors) unchanged, and the only global differences were the shared member's rows and the second workspace; everything was cleaned up afterwards. Tables with a legacy foreign key to `users` (contacts, activity_logs, background_jobs) were not seeded.
