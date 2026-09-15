# Onboarding: editorial interface and save recovery

Routes: /onboarding, /onboarding/founder, /onboarding/vc.

## Design

The chooser, all eight persona steps and completion screens now use the shared
editorial palette, Georgia headings, silver branding in light mode, the existing
dark-mode mark, and a persistent theme switch. Dark surfaces use Anker's deep-blue
tokens. The duplicated onboarding font loader and orange/purple persona accents
were removed.

The chooser uses native radio controls, a permanently visible continue action,
plain-language descriptions and a link to the existing LP portal. LP access is
still subject to the portal's existing entitlement checks.

Setup uses a progress rail on desktop and a compact progress list on mobile,
visible current-step text, a workspace summary that wraps long values, 44px or
larger controls, 16px inputs, grouped field labels, optional/required indicators,
and visible keyboard focus. Step transitions focus the new heading. Loading and
errors are announced. Reduced-motion preferences disable transitions.

## Workflow

- Existing server draft storage, revisions, persona paths and provisioning are
  retained. No database migration or permission changes are required.
- Save and continue persists progress before advancing. Save and exit persists
  the current step, including incomplete fields, then returns to the chooser.
  Select the same persona to resume.
- Entries remain visible after a failed save. Reloading the server draft asks
  before replacing unsaved edits. Concurrent saves are locked. A provisioning
  failure that persisted a draft retains the returned revision for retry.
- Restore failures show a retry action without an editable empty replacement.
  Interrupted upload/extraction statuses are made retryable on restoration.
- Leaving through shell links or closing the browser warns when there are unsaved
  changes. This is not a universal Next.js router blocker: browser history
  navigation can still discard edits since the last successful save.
- Deck controls expose the same upload/extraction status on both company and
  document steps. Processing blocks step navigation and editing; requests have
  bounded timeouts. File type/size errors can be corrected or skipped.
- A document uploaded on the final step is saved without re-extracting and
  overwriting previously reviewed profile details.

## Accurate expectations

The old LP-import selector did not import a CSV; the starter-data-room selector
did not scaffold a room. Both were replaced with clear directions for work after
setup. Raise information and LP types remain setup notes. Copy no longer claims
that onboarding creates runway models, imports networks or guarantees matching.
Fund target amounts are notes; actual reporting currency remains configured in
fund operations.

## Validation and limits

Interaction tests cover choice/continue, theme switching, saved-step restoration,
step-heading focus, required fields, fund sectors, save/restore failures,
revision-aware retry, duplicate-save prevention, completion, and deck-upload
failure/interruption. Production rendering is checked by the Next.js build.

The available cloud browser could not reach the local preview during the earlier
integration work. Rendered desktop/mobile/zoom checks and authenticated tests
against the deployed database are not claimed. Check both themes on a deployment
preview before merging. This commit changes source on the existing editorial
branch; it does not merge or deploy production.
