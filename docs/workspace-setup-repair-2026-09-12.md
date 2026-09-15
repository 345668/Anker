# Founder workspace setup and Discover repair

Branch: `feat/anker-editorial-website`

## Assessment

The workspace concept is appropriate for Anker: one account can participate in several company and fund organizations, with a role and persona on each membership. A company, its fundraising rounds, and its funder are different records. Navigation preview must not grant access or change which organization owns a record.

The implementation was fragmented. This change repairs the setup journey and its Discover handoff; it does not claim that every platform feature now shares a complete organization lifecycle.

The reported production failure was not reproduced inside the user's signed-in session. The defects below were established from the repository and exercised through real API handlers with an isolated SQL database. Production schema state, deployment revision, and provider configuration still require verification.

## Confirmed defects and changes

| Defect | Change |
| --- | --- |
| Every setup step depended on a broad legacy `users` update, including unrelated company and investment fields. | Draft saves use `onboarding_drafts`. Business facts use the same validated organization profile contract as Manage workspaces. Personal introductions remain in the private draft. |
| Existing membership in any company could cause founder provisioning to return without creating the requested company. | Guided setup has an explicit, stable company identity. Other memberships do not suppress creation. Additional companies are created in Manage workspaces. |
| Setup could create a workspace without activating it, or complete without a confirmed link. | Completion atomically creates/links the organization, membership and completed draft, then activates it. Reopening explicitly activates that exact workspace before navigation. |
| Failed completion or a lost response could leave users stuck. | The draft survives a failed completion; retries use its saved revision. Lost completion responses and cookie failures recover without creating a duplicate or overwriting completed data. |
| Older completed drafts lacked a workspace link. | Resume shows a repair message and requires reviewed completion. Existing owned onboarding organizations are reused without overwriting their edited profile. Removed permissions are not restored by setup. |
| Deck-assisted setup called an extraction API requiring an already active workspace, and uploads could land in a different active company. | Authenticated setup extraction reads only the submitted file. Setup uploads use the user-derived reserved company room, which becomes the completed workspace's data-room scope. |
| Setup advertised 25 MB while hosted extraction accepts 4 MB. | The setup UI and founder upload endpoint now enforce 4 MB. Oversized files require compression. |
| Creating a company required a fundraising target. | Fundraising plans are optional notes. A company can be created before fundraising starts. |
| Website fields encouraged bare domains while workspace validation required a scheme. | Bare domains normalize to HTTPS; unsafe URL schemes remain rejected. |
| Editing a workspace replaced its entire profile, losing fields absent from the shorter editor. | Updates merge supplied profile fields; explicit empty values clear fields. Founder geography and fundraising notes are editable. |
| Discover ran legacy matching against `user_settings`/startup rows, independently of the active workspace. | Discover links to Find Investors or LP Matchmaking according to the active membership. The old matching action redirects to those reviewed flows. |
| Discover saved to the legacy outreach table and required a legacy startup. | Directory records save to the current personal CRM, with canonical identity deduplication and read-only membership checks. Existing notes and round links are preserved. |
| Discover's Matches tab aggregated legacy matches across a user's companies. | The legacy tab and query are removed from Discover; matching results belong in the matching workflow. Historical database rows are retained. |
| Company details entered during setup were absent from Find Investors. | Name, summary, sectors, recognized stage and location prefill the active company's matching form. Free-text currency amounts and ambiguous stages require explicit review. |

## Workspace boundaries

| Record or activity | Current contract |
| --- | --- |
| Account identity | Authentication identity; a person can hold several memberships. |
| Company/fund profile | Organization record, editable by its owner/admin. |
| Guided setup | One saved initial setup per person/persona. Additional workspaces use Manage workspaces. |
| Founder documents | Company room. During setup, the reserved room ID becomes the new company's ID. |
| Planning and native decks | Existing user + active organization scope. |
| Fund operations | Existing authorized organization-to-fund link. |
| Discover directory | Shared research data; it is not a private company portfolio. |
| CRM contacts | Personal account records. Directory saves do not automatically assign them to a fundraising round. |
| Investor updates | Personal account records under the existing delivery model. |

Creating a workspace does not create a fundraising round, forecast, cap table, invitation, or ready-to-send campaign. The completion screen explains and links the next steps. It also provides access to Manage workspaces instead of returning users to a completed wizard when they want another company.

## Migration and release

Apply the existing prerequisites, then run:

```bash
node scripts/oneshot/run-migration.mjs --status
node scripts/oneshot/run-migration.mjs scripts/migrations/2026-09-12-workspace-setup-completion.sql
```

The migration adds `onboarding_drafts.workspace_id` and an index. Prerequisites are the organization/membership and fund foundations plus `2026-09-09-audit-repairs.sql`. Discover CRM saves also use the canonical identity constraint/trigger from `2026-09-12-founder-workflow-integrity.sql`, shipped in the preceding commit.

Apply the migrations before deploying the application change. Migration SQL is additive and was tested twice against the isolated database. Production was not modified. Missing setup tables/columns return `SETUP_SCHEMA_PENDING` with a useful message rather than silently reporting completion.

After migration/deployment:

1. Sign in as a founder with no workspace; save, leave, resume and finish setup without a raise target.
2. Repeat while another company is active. Confirm the new company is activated and the old one is unchanged.
3. Upload a PDF below 4 MB, review extraction, finish setup, and verify the deck is in the correct company room.
4. Open Discover, save a firm twice, and confirm only one canonical CRM entry. Open matching and review the company defaults and missing round inputs.
5. Test an older completed setup and a read-only member on desktop/mobile, including keyboard focus and failure recovery.

## Remaining architecture work

- Implement a complete workspace team lifecycle: invite, accept, change role, revoke, transfer ownership, and inspect access history. This setup does not perform those actions.
- Decide which account-owned records should be shared within a workspace. Migrate CRM relationship links and investor-update ownership with explicit backfill and access rules, rather than guessing ownership from the currently selected workspace.
- Retire or scope the remaining legacy pipeline/match mutation actions and other old account-profile paths. Discover no longer invokes those matching/outreach paths, but this change is not a whole-platform authorization audit.
- Add archive/delete lifecycle, retention rules and recovery for organizations; clarify billing/entitlements per account versus workspace.
- Decide whether guided setup should become a resumable checklist per organization. The current supported route for a second company/fund is Manage workspaces, with an editable profile and tool-specific follow-up.
- Reconcile pre-existing uploads in legacy `user:<id>` rooms explicitly. New setup uploads use the reserved organization ID; this change does not guess ownership or move arbitrary older files.
- Confirm production migrations, authenticated browser behavior and actual storage/AI provider operation. Those were not verified against production in this pass.

## Verification

- **255 tests passed across 45 files**, using `pnpm exec vitest run --maxWorkers=2`. The initial unrestricted run hit database-startup hook timeouts in two suites; reducing worker contention completed all tests without skips.
- **TypeScript passed** with `pnpm exec tsc --noEmit --pretty false`.
- SQL tests use actual route handlers and PGlite. Covered draft resume, first/second company creation, atomic completion failure, concurrent completion, lost cookie/response recovery, legacy repair, removed membership, profile preservation, VC separation, setup upload destination, unauthenticated/invalid extraction, viewer upload denial and CRM deduplication.
- Identity, cookies, Blob and extraction providers are simulated. UI tests use React DOM/jsdom and cover optional fundraising, the setup-specific deck route, activation failure and matching prefill.
- Production database, signed-in browser, real Blob/AI requests and deployment were not verified. No production migration was applied.
