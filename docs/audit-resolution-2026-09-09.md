# Audit resolution — 9 September 2026

This branch applies the attached Anker UI/UX audit and platform audit to the
editorial website and authenticated platform. The attached source reports are
kept as audit evidence; this file records the implementation disposition.

## Resolved in this branch

- Admin authorization uses the server-controlled email allowlist and
  `users.is_admin` row keyed by the authenticated user id. Editable Supabase
  user metadata is not an authorization source.
- Fund pages and fund APIs resolve the active fund workspace and verify the
  workspace owner/admin role before reading or mutating a fund. The previous
  hardcoded fund slug is no longer used as an access decision.
- Dashboard aggregates are scoped to the active founder CRM or fund deal-flow
  workspace, use database counts, and expose the correct workspace scope.
- Deprecated pipeline links route founders, fund operators, and LPs to their
  own workflow rather than a shared dashboard.
- Share creation, copy, and revocation report server-confirmed state; failed
  operations preserve the current grant and offer retry/fallback copy.
- Onboarding drafts are versioned and resumable. Completion waits for profile
  and workspace persistence, and workspace seeding is idempotent. Founder deck
  uploads create a data-room document instead of storing only a filename.
- CRM, notification, task, discovery, and outreach mutations check HTTP and
  application-level success before updating local state. Failed delivery can
  be retried, and concurrent reply approvals claim one outbound row.
- Discovery filters and pagination are URL-backed and applied by the database;
  totals and facets come from the filtered result set rather than a capped
  client-side slice.
- Fund contact drawers use the existing Sheet primitive with an accessible
  title/description, keyboard-openable Kanban records, labelled icon actions,
  and visible failure messages.
- Public contact submissions no longer report success when neither persistence
  path succeeds. Public access/demo copy remains invite-aware and routes to the
  contact flow rather than a registration loop.

## Already shipped and retained

The editorial homepage, newsroom, deep-blue theme tokens, silver logo variants,
footer GitHub destination, responsive sidebar, and public navigation redesign
were already present on this branch and were not replaced.

## Validation

- `pnpm test -- --run`: 16 files, 89 tests passed.
- `pnpm typecheck`: passed with build-time type errors enabled.
- `git diff --check`: passed.
- The Sites preview runner is not used for this Next.js app because it injects
  Vite flags that Next 16 does not accept; production build validation follows.

## Follow-up requiring product/data review

Published network and outcome claims should continue through an evidence owner
and as-of-date review before being reused in new pages. No unsupported claim is
used as an authorization or workflow decision.
