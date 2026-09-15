# Workspace teams, ownership and shared records

Branch: `feat/anker-editorial-website`

This change continues the workspace setup repair. A workspace owns shared operating records; a membership supplies the acting person's role and persona. Record creators remain attribution and do not retain workspace access after removal. Navigation preview does not supply authorization.

## Team lifecycle

Manage workspaces → **Team & access** opens the explicitly selected organization's roster, invitations, transfer requests and access history.

| Capability | Owner | Admin | Member | Viewer |
| --- | --- | --- | --- | --- |
| Read shared operating records | Yes | Yes | Yes | Yes |
| Edit shared CRM, tasks, rounds and native decks | Yes | Yes | Yes | No |
| Send workspace outreach or company investor updates | Separate sending permission | Separate sending permission | Separate sending permission | No |
| Invite or manage members/viewers | Yes | Yes | No | No |
| Grant admin or sending permission | Yes | No | No | No |
| Transfer ownership, archive or restore | Yes | No | No | No |
| Leave | Transfer ownership first | Yes | Yes | Yes |

Fund-team invitations create VC memberships; company invitations create founder memberships. LP portal membership is managed separately and cannot be promoted through this team workflow. Financial Fund OS features retain their existing owner/admin requirements.

- Invitations require the exact invited, verified authentication email. Tokens are random and only their SHA-256 hashes are stored. Links expire after seven days. Opening or reviewing a link never joins automatically.
- A replacement invite revokes the previous pending link. Acceptance retries are idempotent for the same existing member; a previously accepted link cannot restore removed membership or change an existing role.
- Link delivery is available without an email provider. Optional email uses the existing Resend configuration and records its receipt or failure. A provider receipt means accepted for sending, not confirmed inbox delivery. Failed or uncertain delivery offers the link; the UI does not report successful email delivery without a receipt.
- Ownership transfer requires an existing member/admin to accept within 48 hours. The previous owner becomes an admin, retaining access until explicitly removed. Pending invites are revoked at handoff. The owner can separately disable their own sending permission.
- Team mutations lock the organization and check a revision in the same transaction as membership changes and the access event. A stale revision returns a conflict and requires review, without an automatic mutation retry.
- Archive retains records and memberships, removes the workspace from operating selection, and revokes pending invitations/transfers. Only the canonical owner can restore it. There is no hard-delete or billing cancellation action.
- Permission checks apply to subsequent requests and queued claims. Investor-update delivery rechecks permission before each recipient. A provider request or extension action already in flight cannot be recalled by removing a member.

## Ownership boundaries

| Record | Scope after this change |
| --- | --- |
| Company/fund profile | Organization; owner/admin editing |
| CRM boards, contacts and linked tasks | Organization; creator retained as attribution |
| Fundraising rounds and native Deck Studio decks | Organization, with workspace-matching parent/context checks |
| Investor updates | Company organization; separate sending permission; immutable delivery snapshot and original sender retained on retry |
| Runway and Cap Table scenarios | Personal within the selected organization; labelled personal planning |
| Generated artifact download bytes | Personal within the organization, with existing ownership and expiry checks |
| Call recordings, transcripts and analysis | Personal; linking to shared CRM does not share recordings |
| Outreach drafts, campaign metadata, mail accounts, LinkedIn network and sender actions | Personal; operations involving shared CRM also require current workspace access |
| Saved CRM views | Personal preferences within the organization |
| Public discovery directory | Shared research data; saving creates a relationship in the chosen workspace |

This is not a claim that every historical platform record has become organization-owned. Private planning, recordings and sender credentials are deliberately not transferred with workspace ownership. Company data-room rules remain in their existing workflow; arbitrary legacy `user:<id>` uploads are not moved by this release.

## Legacy records and integrations

The shared-record migration backfills a legacy board only when its fundraising-round links identify one organization and its contacts/tasks have consistent creator ownership. Other legacy CRM boards, unassigned contacts and investor updates remain unassigned until their creator uses **Review legacy records**. The review names the destination and requires confirmation. A board move includes its contacts and linked tasks. Conflicting ownership or duplicate canonical identities rolls back the whole move; records are not silently merged or deleted.

Existing duplicate relationships discovered within a shared workspace retain their rows, notes and associations. Only the earliest keeps its canonical import key. Separate rounds referencing the same board in one organization require explicit repair before the new unique index can be installed. Standalone legacy tasks and saved-view preferences are not included in the move UI.

CRM routes, discovery saves, assistant CRM tools, native deck context, rounds and company updates use organization scope. Connected outreach, call links, email reply matching and Twenty synchronization validate access to linked CRM records. Private drafts now use sender/contact/kind uniqueness, so teammates do not overwrite each other's drafts. Retired Discover matching mutation actions return a clear failure instead of modifying global legacy matches.

The LinkedIn extension must select a workspace when an account has multiple memberships. Its Setup connection check lists available workspaces; save the selection before using CRM actions. Older clients receive a workspace-selection error rather than choosing arbitrarily. Approved queued CRM actions require current workspace sending permission at claim time. Rebuild and distribute the updated extension separately; no installer was published in this change.

Twenty's provider connection remains deployment-configured; this release scopes Anker records, not provider credentials per organization. IMAP address-only fallback associates a reply only when exactly one authorized CRM contact matches; ambiguous cross-workspace replies remain unmatched.

## Database rollout

No production migration has been applied in this session. Schedule this as a coordinated application/schema release: the CRM and outreach conflict targets change, so the previous application cannot safely keep writing throughout migration.

Prerequisites include the organization/membership foundation, current CRM boards/tasks/views and outreach-message tables, fundraising rounds, investor-update delivery state, `2026-09-12-founder-workflow-integrity.sql` and the preceding workspace setup repairs. Check the existing migration ledger and actual schema first; do not use `--backfill` to mark missing migrations as installed.

1. Take a restorable database snapshot and pause application writes, outreach jobs and extension workers.
2. Run the read-only preflight. Resolve every reported owner, parent-link or duplicate conflict against known business ownership. Do not infer the owner from the current workspace cookie or bulk-delete conflicting records.
3. Apply both new migrations and their ledger entries in one transaction, using the wrapper below. It orders lifecycle before shared records. `ON_ERROR_STOP` and `--single-transaction` are required: the older generic migration runner executes individual statements without an enclosing transaction.
4. Deploy this application's revision before resuming writers. Re-run preflight, check backend database grants, and complete the staging checks below before reopening access.

From the repository root, with the database connection already supplied securely in `DATABASE_URL`:

```bash
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -f scripts/checks/workspace-team-preflight.sql
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f scripts/oneshot/apply-workspace-team.sql
```

The wrapper includes:

1. `scripts/migrations/2026-09-13-workspace-team-lifecycle.sql`
2. `scripts/migrations/2026-09-13-workspace-team-shared-records.sql`

These two SQL files can also be reviewed directly in a database console. The wrapper uses psql-specific include commands, so do not paste the wrapper into a web SQL editor. For that interface, execute the contents of both migrations in order within one explicit transaction and record the two filenames in `schema_migrations` after success. The wrapper's ledger checksums are intentionally NULL.

Functions run as the calling database role, with public execution revoked. The invitation, transfer and access-event tables have RLS enabled without client policies. The trusted server database role must own these objects (the normal application deployment contract) or be explicitly provisioned with the required privileges and RLS bypass by the database administrator. Never grant these actor-parameter functions to anonymous/browser database roles. An authenticated user ID and verified email come from server-side authentication, not the request body.

A failed transaction leaves the previous schema in place. After a successful release, prefer a reviewed forward fix; restoring an old application against the new uniqueness rules is not a safe rollback. If reverting the database snapshot, stop writers first and account for any data created since it was taken.

## Verification and deployment checks

`pnpm exec vitest run --maxWorkers=2` passed **275 tests across 47 files**. `pnpm exec tsc --noEmit --pretty false` and `git diff --check` also passed, after incorporating the remote branch's newer ledger and migration fixes.

Local verification uses actual API handlers and PostgreSQL semantics through PGlite, with simulated authentication and providers. It covers multiple workspaces, cross-workspace parent rejection, repeated imports, handoff followed by removal of the original creator, invite replay/revocation/expiry, role escalation, LP separation, concurrent team changes, archive/restore, send-permission loss, legacy-move rollback and approved LinkedIn claims. Migration reapplication and the preflight query are exercised against the test database.

React DOM/jsdom checks cover confirmation focus, Escape dismissal, return to the initiating button, viewer controls, and stale-revision handling. The changed extension files passed TypeScript syntax transpilation; its isolated dependencies were unavailable, so a packaged extension build has not been verified. Live browser focus behavior, actual invitation email, provider configuration and production database state remain unverified.

Before production sign-off:

- Use two authenticated accounts and two companies/funds. Invite, accept, grant/revoke sending, transfer ownership, remove the former owner, and confirm shared-record access follows membership while private files stay private.
- Verify a real invitation email's link, verified-email requirement and provider receipt; revoke a link and confirm it cannot join. No actual email was sent during automated tests.
- Review and move an older board; confirm contacts/tasks move together and a duplicate conflict changes nothing.
- Archive and restore; confirm selection, calls, CRM, updates and extension claims respect archived state.
- On mobile and desktop, verify dialog focus entry, keyboard traversal, Escape and return focus; rebuild the extension and test workspace selection with two memberships.

Still separate work: per-workspace billing/seat enforcement, retention/hard deletion, organization-specific provider credentials, broader legacy upload reconciliation, and any migration of private planning/call/campaign records to a new sharing model.
