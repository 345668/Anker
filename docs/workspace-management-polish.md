# Workspace management polish

The workspace manager is available at `/dashboard/entities`, including for platform admins. Admin fund reporting remains a separate section. The top-bar switcher links to the manager and refreshes workspace names after edits.

## User flows

- Founders create company workspaces with stage, sectors, website and summary.
- VC operators create fund workspaces with currency, vintage, target size, investment stages, geography and thesis. New funds start in fundraising status.
- Creating a workspace leaves switching as an explicit action. Switching reloads the app after the server validates membership and sets the active cookie.
- Workspace owners and admins can edit. Members and viewers cannot. LP access continues through the existing invitation-based `/lp` portal; creating an operating workspace does not grant LP access to existing funds.
- The editor focuses the name field, restores focus on close, asks before discarding unsaved entries, retains failed submissions and announces successful saves. Inputs are disabled while saving.

## Persistence

Creation uses a user-scoped request ID so retries are idempotent. Workspace and fund creation occur in one SQL statement. Edits update the organization and canonical fund in one statement, preserve unrelated settings and fund metadata, and compare a workspace revision to reject stale saves. Existing financial fields omitted from a request are preserved. Currency is selected on creation and read from the canonical fund on edit.

No new migration is required. This uses the existing organizations/settings, memberships and funds schema from `2026-08-08-personas-owner.sql` and `2026-06-21-funds-and-lps.sql`. The revision is stored in organizations.settings.workspaceRevision and defaults to zero for existing workspaces.

## Verification

`pnpm typecheck` and all 161 Vitest tests pass. New tests call the actual persistence functions against PGlite using the repository's table migrations, including idempotent creation, membership scoping, role restrictions, simultaneous stale edits, metadata preservation and transaction rollback. DOM tests cover success/failure feedback, initial and returned focus, unsaved-change cancellation and creation retries.

Authenticated production journeys, native mobile browser focus trapping, visual screenshots and a production build have not been verified in this pass. DOM tests emulate the native dialog methods and do not substitute for browser verification. The earlier build and push attempts were rejected by automatic approval review with a usage-limit reason; these actions were not retried in this pass.
