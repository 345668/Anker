# Portfolio workspace authorization

Implemented on `feat/anker-editorial-website`, 2026-09-11.

## Access contract

Portfolio access follows the existing Fund OS policy: the signed-in user must
have an active membership with persona `vc`, workspace kind `fund`, and role
`workspace_owner` or `admin`. The workspace's `organizations.fund_id` identifies
the fund. Platform staff privileges and persona previews grant no tenant access.

| Request | Result |
| --- | --- |
| Signed out | API 401; pages redirect to login |
| Missing/unauthorized fund workspace | API 403; pages not found |
| Omitted fund selector | Use active authorized fund |
| Active fund ID or slug | Accept; persist canonical fund ID |
| Another fund selector, including another membership | 403 until workspace is switched |
| Another fund's record ID | 404; no record content or mutation |
| Forged workspace cookie | Existing membership resolver selects a valid membership; it never authorizes the forged workspace |

## Covered flows

- Portfolio overview, company detail, create/edit/delete, KPI history and manual entry.
- AI KPI extraction, fund-specific review queue, company reassignment, approval,
  dismissal and deletion. Approval locks the pending review and commits its KPI
  and review status in one PostgreSQL statement. Database constraints reject
  cross-fund company links.
- Quarterly LP letters: list, generation context, detail, edit, review, delete and
  DOCX export. Reviewer identity comes from the session.
- Compliance overview, intake, overrides, deadlines and dashboard digest counts.
  The trusted scheduled digest still intentionally processes all funds.
- Capital-call/distribution wizard submissions use the active authorized fund;
  submitted LP IDs must belong to that fund. Wizards pin requests to their
  displayed fund to reject stale forms after another tab switches workspaces.
- Portfolio company creation from investment closing and distribution selection
  now use canonical fund IDs. Distribution company lookups and the assistant's
  portfolio KPI rollup are fund-scoped.
- Portfolio and Compliance are restored in VC navigation. The portfolio heading
  shows the fund's name instead of its database identifier.

This does not broaden workspace members/viewers into fund administrators or
convert separate staff-only tools such as LP statement imports into customer tools.

## Required migration

Apply `scripts/migrations/2026-09-11-portfolio-fund-authorization.sql` against the
target database before serving portfolio traffic with this application version:

```bash
node scripts/oneshot/run-migration.mjs scripts/migrations/2026-09-11-portfolio-fund-authorization.sql
```

The runner reads `NEON_DATABASE_URL` or `DATABASE_URL`. Existing portfolio, funds,
quarterly-report and KPI-extraction migrations must already be present. Coordinate
the application rollout with this migration: the old application writes fund slugs,
which the new foreign keys reject.

The migration is a single atomic PostgreSQL `DO` statement, compatible with the
repository's HTTP migration runner. It normalizes known slugs to `funds.id`, infers
null extraction scopes only from their linked companies, removes the flagship
defaults, adds ownership foreign keys and fixes the KPI `email_update` source check.
It is safe to rerun. Fund deletion is rejected while portfolio records reference it.

Unmapped fund references, null scopes without a linked company, ID/slug ambiguity,
cross-fund company links or duplicate company/quarter keys stop the entire migration.
No records are deleted, guessed into a default fund or silently reassigned. Review
and explicitly correct the reported legacy ownership issue, then rerun.

## Verification

`lib/portfolio/workspace-authorization.integration.test.ts` invokes the real request
handlers, active-membership resolver and SQL query modules against PGlite PostgreSQL.
Only session/cookie transport, SQL transport, AI generation and DOCX rendering are
mocked. Two funds, two users and a user with both fund memberships cover ownership,
workspace switching, ID tampering, scoped generation/export, mutations and denial.

`lib/portfolio/fund-ownership-migration.test.ts` checks rollback on five legacy-data
failure cases. The integration suite checks successful backfill and repeat execution,
database constraints, simultaneous approval requests and rollback of a failed KPI write.
These are local PostgreSQL integration tests, not a production browser session or a
production database migration. No production data has been changed.

Final validation: `pnpm test` passed all 200 tests across 36 files;
`pnpm typecheck` and `git diff --check` passed. The mobile dialog regression test
now waits for asynchronous focus restoration, and the compliance digest test
expects the actual compliance route.
