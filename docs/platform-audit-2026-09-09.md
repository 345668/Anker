# Anker platform audit — 9 September 2026

**Audited commit:** `6007957fe1d5d2779cb7ed7fad445cd175bb5489`  
**Branch:** `feat/anker-editorial-website`  
**Verdict:** the shared UI foundation has improved, but the platform is not ready for a broader customer rollout. Address authorization and tenant isolation first, then repair misleading operation states and navigation. Further visual redesign should build on those corrections.

This is a code and isolated-behavior audit, not a penetration test or a complete visual certification. The route inventory contains **151 dashboard pages and 3 LP pages**. Deep review covered the shared navigation, dashboard home, CRM, discovery, outreach, representative fund routes, LP access resolver, workspace membership and admin guards. Inventory does not mean every route was exercised.

## Results

| Severity | Count | Meaning |
| --- | ---: | --- |
| Critical | 1 | Authorization boundary must be repaired before customer rollout |
| High | 6 | Tenant scope, core journey or operational correctness problems |
| Medium | 5 | Discoverability, accessibility, consistency and validation gaps |

| ID | Severity | Finding | Evidence |
| --- | --- | --- | --- |
| A01 | Critical | Admin access trusts user-editable metadata | Source + isolated guard probe |
| A02 | High | Fund pages lack consistent fund-membership authorization | Source + missing-membership guard probe |
| A03 | High | Home metrics and deals are not scoped to the selected workspace | Query-to-render trace |
| A04 | High | Founder pipeline links return to the dashboard | Isolated redirect probe |
| A05 | High | Discovery reports research/enrichment success without doing the work | Source trace to active controls |
| A06 | High | CRM and header tasks can display saves that failed | Source + header task failure probe |
| A07 | High | Reply approval can prevent retry after delivery failure | Isolated route-handler probe |
| A08 | Medium | Discovery filters cover different data scopes | Request/filter trace |
| A09 | Medium | Desktop and mobile navigation expose different destinations | Static destination comparison |
| A10 | Medium | CRM overlay and Kanban remain incomplete for keyboard users | Component inspection |
| A11 | Medium | Light-mode input border token is too faint for boundary-dependent fields | Calculated token contrast |
| A12 | Medium | The current commit fails TypeScript checking | Fresh `pnpm typecheck` |

## Detailed findings

### A01 — Critical: admin access trusts editable user metadata

**Location:** `lib/auth/require-admin.ts:36,61`.

Both `requireAdmin()` and `isAdminUser()` grant access when `user.user_metadata.role === "admin"`, before consulting the server-side role table. Supabase documents that authenticated users can modify user metadata and that it must not hold authorization data. See [Supabase's metadata authorization guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

**Impact:** an ordinary authenticated identity with this metadata can be recognized as an administrator by shared guards. These guards protect fund APIs and platform settings, so this is an authorization flaw, not just an incorrectly displayed menu.

**Verified:** an isolated mock of an ordinary, non-allowlisted identity with that metadata passed both guards without any trusted role-table lookup. No live account was modified and no privileged endpoint was called against production. Live exploitability remains dependent on deployed authentication configuration, but the unsafe trust decision is confirmed in code.

**Fix:** derive staff privileges only from a server-controlled role store or trusted app metadata; remove every user-metadata admin shortcut. Keep owner/staff privileges distinct from customer organization roles. Check all uses of the same pattern, not only this helper.

**Acceptance:** changing user metadata cannot change access. A non-admin receives 403 from protected APIs and cannot read privileged server-rendered settings. Add tests for signed-out, ordinary, organization-admin and Anker-staff identities.

**Origin:** pre-existing; the redesign retained it.

### A02 — High: persona is used where fund membership is required

**Locations:** `lib/auth/persona-guard.ts:25–26`; `app/dashboard/portfolio/fund/layout.tsx`; `app/dashboard/portfolio/fund/performance/page.tsx:20`; `app/dashboard/portfolio/fund/page.tsx:22–28`.

The fund layout accepts any VC persona and deliberately passes users with no membership. The performance page then selects `svs-fund-ii` directly, without resolving an authorized fund from the active organization. Its parent chain has no additional fund-specific guard. By contrast, the fund overview redirects non-staff users to the dashboard.

**Impact:** the same fund section is inconsistent: a legitimate customer VC can be bounced from the overview while a direct performance URL can load a fixed fund unrelated to their organization. A missing-membership identity also passes the persona guard. The actual data exposure depends on deployed rows and database permissions; the absent application-level fund boundary is confirmed.

**Fix:** resolve an authorized fund using server-side organization membership and role, then pass that fund ID into every read and mutation. Missing membership should lead to onboarding/access-denied, not full persona access. Align navigation with those capabilities.

**Acceptance:** fund A members cannot access fund B by URL, cookie or API parameter; switching workspaces changes the selected fund; no-membership users cannot read a fund. Ordinary authorized GP members can reach their own overview and permitted actions.

**Origin:** pre-existing.

### A03 — High: dashboard overview mixes global and unrelated data models

**Locations:** `app/dashboard/page.tsx:43–47,80`; `lib/db/platform-queries.ts:265–273,337–343`; `components/tesseract/dashboard-content.tsx:64–87`; `app/dashboard/crm/page.tsx`; `app/dashboard/fundraising/pipeline/page.tsx`.

The dashboard uses global `getDeals(100)` and `getContacts(100)` queries with no user, owner or organization predicate. The SQL driver uses the shared database connection without request-specific identity setup in this call path. Deal names, amounts and firm names are passed into the client overview. The contact card links to a user-scoped CRM built from `crm_entries`, not the `contacts` table it counts. Founder fundraising and GP deal flow use other records again.

**Impact:** the home screen can show unrelated deal data and counts that do not agree with the destination page. The loaded-record scope note is helpful but does not provide tenant isolation or fix the data-model mismatch.

**Fix:** make the overview persona- and organization-aware, reuse the same scoped query layer as each destination, and aggregate counts independently of list limits. Verify the shared database role's permissions as part of the isolation review.

**Acceptance:** two distinct workspaces produce distinct authorized results; overview counts reconcile with their linked CRM/pipeline; zero and unavailable data remain separate states.

**Origin:** inherited query design, retained in the rebuilt dashboard.

### A04 — High: founder dashboard pipeline actions lead back home

**Locations:** `components/tesseract/dashboard-content.tsx:68,74,80,137,173`; `app/dashboard/pipeline/page.tsx:17`; `lib/auth/persona-guard.ts:28`.

The home metric and recent-deal links use `/dashboard/pipeline`. That route redirects to `/dashboard/portfolio/fund/deals`. The fund persona guard redirects founders back to `/dashboard`.

**Impact:** founders click the pipeline card and return to the starting page without an explanation. Non-staff VCs also encounter the separate admin gate on the GP deal page.

**Fix:** route founders directly to `/dashboard/fundraising/pipeline`; route authorized GP users to their fund deal flow. Do not render inappropriate metrics/actions for LPs. Pair this with A03 so link destinations and data agree.

**Acceptance:** test the complete navigation chain for each persona, rather than only asserting that an anchor exists.

**Origin:** legacy route retained in the redesigned home. Reproduced with isolated redirect calls.

### A05 — High: discovery actions report work that never ran

**Location:** `components/tesseract/discover-content.tsx:454–491`, connected to row controls and bulk controls around lines 560, 682 and 720–722.

`handleDeepResearch`, `handleUrlCheck` and `handleEnrichData` use timers to show completion messages without a research, verification or enrichment request. `handleBulkEnrich` only changes the status message. The bulk-add path also announces that every selection was added without checking returned success values.

**Impact:** staff can believe an investor was researched or a URL was verified when no evidence was collected. Failed batch additions can look complete.

**Fix:** connect controls to actual jobs with request IDs and per-record outcomes, or clearly disable unavailable actions. Report successful, failed and skipped counts separately. Never mark research complete without a stored result.

**Acceptance:** each success state is backed by a completed operation; failed additions retain retryable selections; unavailable features cannot display a completion message.

**Origin:** pre-existing. The earlier UI pass removed some inert menu items but did not eliminate these active placeholder handlers.

### A06 — High: operational failures are still hidden outside the dashboard task feed

**Locations:** `components/crm/crm-powerhouse.tsx:116–166`; `components/crm/contact-detail.tsx:234`; `components/shell/header-trays.tsx:151–159`.

CRM updates and deletions immediately change local state, then ignore HTTP error status. Bulk edits/deletes have the same issue. Notes clear their dirty flag immediately. Header tasks also mark an item done before a PATCH request and neither check HTTP status nor restore state on failure. This differs from the redesigned dashboard task feed, which handles failure explicitly.

**Impact:** operators can lose confidence in saved notes, stages and deletions; a task disappears despite a failed save. Independent task caches can also disagree between header and home.

**Fix:** return mutation results to callers; either wait for confirmed success or snapshot and roll back optimistic edits. Expose actionable error/retry states and invalidate shared caches after successful saves. Preserve unsaved notes.

**Acceptance:** mocked 401, 403, 409 and 500 responses do not appear successful; failed deletes leave the record visible; failed notes remain editable; header and home counts converge.

**Origin:** pre-existing paths retained in this phase. The header task defect was reproduced in jsdom with a mock 500 response.

### A07 — High: approval and delivery are conflated, preventing normal retry

**Locations:** `app/api/outreach/followups/route.ts:87–119`; `components/outreach/outreach-powerhouse.tsx:112–120`.

The route sets a reply to `approved = true` before attempting delivery. A failed delivery is wrapped into `{ ok: true, delivery: { ok: false, ... } }`. The client ignores the returned body. A retry receives `alreadyApproved: true` and skips delivery entirely.

**Impact:** an operator can approve a response, have delivery fail, and then be unable to retry through the same approval action. A background mechanism may exist elsewhere, but this UI path does not surface or repair the failed delivery.

**Verified:** an isolated route test returned success with a failed-delivery result; the second request did not call the delivery function again. No real messages were sent.

**Fix:** model approval, queueing, sending, delivery and failure separately. Use an idempotent delivery job, show its status, and offer a safe retry for failed attempts. Preserve duplicate-send prevention.

**Acceptance:** provider failure produces a visible failed-send state; retry can succeed once; rapid repeated approvals cannot send duplicates.

**Origin:** pre-existing.

### A08 — Medium: discovery filters do not share a complete search scope

**Locations:** `components/tesseract/discover-content.tsx:191–201,239–249,286–316,340–367`.

Investor requests pass search, sector and stage to the API; type, country, email, LinkedIn and check-size filters operate on loaded records. Firm requests use a different subset. Country choices partly come from `initialFirms`, so newly loaded firm regions do not expand that set. The new description correctly says “loaded results,” but the filters still require manual loading to discover matches outside that batch.

**Impact:** operators may overlook qualified investors or be unable to select a relevant region before loading more data. A database-wide search can appear empty because of a local filter.

**Fix:** use a shared server-side filter contract, server-derived facets and filtered totals; apply pagination after filtering. Keep result count and loading terminology aligned with actual scope.

**Acceptance:** a matching record outside the first batch can be found directly; filtered totals and region facets are consistent for investors and firms.

**Origin:** pre-existing; scope copy improved in the redesign.

### A09 — Medium: navigation parity depends on viewport and shell mode

**Locations:** `components/tesseract/dashboard-sidebar.tsx` (`NAV_GROUPS`); `lib/nav/taxonomy.ts` (`APP_NAV`); `components/shell/app-mobile-nav.tsx`; `components/shell/app-subnav.tsx`.

The default desktop sidebar keeps its own navigation list. Mobile navigation and the alternative shell read the shared taxonomy. Static comparison found 11 taxonomy destinations absent from the desktop sidebar list: `/dashboard/calls`, `/dashboard/signals`, `/dashboard/updates`, and eight LinkedOut routes (analytics, campaigns, extension, leads, review, senders, suppression, unibox).

**Impact:** customers see materially different product entry points on phone and desktop. These are not necessarily unreachable: the command palette and alternative shell provide other paths. The issue is inconsistent primary discoverability.

**Fix:** drive both shells from one permission-aware route taxonomy and retain only presentation differences.

**Acceptance:** equivalent personas can find the same supported destinations in either shell and at either viewport. Test destination parity, not only individual menu behavior.

**Origin:** pre-existing list divergence, more visible now that default mobile navigation uses the taxonomy.

### A10 — Medium: CRM detail overlays and Kanban remain keyboard-incomplete

**Locations:** `components/crm/contact-detail.tsx:127–145`; `components/crm/crm-powerhouse.tsx:555–583`.

The grid/Kanban detail overlay is a fixed `div` rather than an accessible dialog. It has no managed focus, modal semantics or Escape dismissal. Kanban cards are clickable draggable `div` elements without keyboard activation. Several icon-only detail actions lack specific accessible labels.

**Impact:** the new shell's keyboard support does not extend into an important relationship workflow. Users cannot complete the same journey consistently without a pointer.

**Fix:** reuse the existing Sheet/Dialog primitive for overlays; give cards a real button/link for opening; provide a non-drag stage-change action; label icon controls and restore focus on close.

**Acceptance:** open, edit, move and close a Kanban contact using only a keyboard, with a screen reader identifying the contact dialog and its controls. Browser testing is still required for actual focus order and responsive overlay behavior.

**Origin:** pre-existing, not fully addressed by the platform styling pass.

### A11 — Medium: light input boundaries need stronger contrast

**Location:** `app/platform.css`, light `--input: #8d9eac` and `--card: #ffffff`.

The input-border token has approximately **2.76:1** contrast against a white card; the corresponding dark pair is approximately **3.29:1**. Fields relying on that boundary to identify the input should reach 3:1. This does not imply every outlined button fails: a button can have other sufficient visual identifiers. See [W3C's non-text contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

**Fix:** darken the light input boundary token and verify empty, populated, hover, focus and error states on their actual adjacent surfaces. Also review older fields using translucent `foreground` borders instead of `--input`.

**Acceptance:** boundary-dependent controls meet 3:1 on the rendered surfaces; keyboard focus remains clear in both modes.

**Origin:** new platform palette. This is a token-level finding, not a full rendered WCAG conformance assessment.

### A12 — Medium: TypeScript fails despite a successful deployment status

**Locations:** `lib/platform/workspace-interactions.test.ts:23`; `next.config.mjs:3–5`.

A fresh `pnpm typecheck` fails with TS2352: the test's partial object is cast directly to Supabase `User` while missing `id`, `app_metadata`, `aud` and `created_at`. The deployed build configuration has `typescript.ignoreBuildErrors: true`, so a successful Next/Vercel build does not prove the type gate passed.

**Fix:** construct a complete typed user fixture. Require a successful independent typecheck before merge and verify branch protection actually enforces the configured typecheck job.

**Acceptance:** `pnpm typecheck` exits 0 on the exact candidate commit. Keep the Vercel deployment status and CI type gate distinct.

**Origin:** the new workspace interaction test. This corrects the earlier delivery message claiming that the final committed state passed TypeScript checking.

## What passed

- The existing test suite passed: **89 tests across 16 files** (`pnpm test`). This does not cover all routes or authorize a release.
- Five isolated audit probes reproduced A01, the missing-membership part of A02, A04, the header-task part of A06, and A07. These are observational probes that assert current defective behavior; they are intentionally outside the ordinary passing test suite.
- Token checks over foreground, muted text, link, success, warning and danger against background, card, muted and accent surfaces found minimum text contrast of **5.09:1 in light mode** and **6.51:1 in dark mode**. Hard-coded component colors, transparency, charts and disabled states are outside those pair checks.
- The active-workspace POST route verifies that the requested organization is one of the user's memberships before setting its cookie.
- The task PATCH route checks the assignee in its UPDATE predicate; the redesigned dashboard TaskFeed checks HTTP status and preserves retry behavior.
- The LP resolver scopes ordinary users by matching their email to linked LP membership; its special all-LP oversight path checks the owner separately. Document delivery/storage entitlements were not exhaustively tested.
- The recent platform tests cover mobile dialog naming/focus/resize, persona/admin link visibility, command-palette behavior, table search/sorting, failed workspace switching and zero/missing home values.
- GitHub reports **Vercel success** for audited commit `6007957`. This verifies the reported deployment check only; it does not prove all GitHub Actions jobs or branch-protection requirements passed.

## Recommended implementation order

1. **Authorization and scope:** A01–A03. Establish trusted staff roles and a consistent organization/fund access resolver. Test with at least two unrelated organizations and a membership-less identity.
2. **Reliable daily work:** A04–A07. Correct persona-specific home actions, remove simulated success, and unify mutation/delivery state handling.
3. **Consistent interaction:** A08–A11. Unify filter contracts and navigation; complete CRM keyboard paths and input contrast.
4. **Merge gate:** fix A12 immediately, then repeat full tests and TypeScript on the exact new commit. Validate founder, GP and LP journeys on the deployment preview at 375px, 768px and 1440px in both themes, including keyboard-only interaction.

## Reproduction and limits

Run the isolated audit probes from the repository root:

```sh
pnpm exec vitest run --config docs/audits/platform-2026-09-09/vitest.config.mts
```

The probes mock authentication, SQL, fetch and delivery. They perform no live account changes, database mutations or message sends. They deliberately confirm existing defects; replace them with desired-behavior regression tests when implementing fixes.

No authenticated browser session, production database access, real payment/capital activity, outbound message send, mobile device testing or load testing was performed. Live database policies, customer data volume, external-provider behavior and full document-access enforcement require a separate authorized environment check. Historical audit database counts were not reused as current measurements.

Application source was not changed by this audit. The report and isolated probes are local review artifacts; no vulnerability report or issue was published to GitHub.
