# Founder workflow implementation — 12 September 2026

Branch: `feat/anker-editorial-website`.

This implements the six urgent workstreams from the founder audit. The changes are in the repository; applying the migration and deploying the branch are separate steps. No production database migration or real email delivery was performed during verification.

## Delivered changes

| Area | Result |
| --- | --- |
| Legacy contacts/deals | Removed the unscoped list-query functions. Legacy contacts redirects to the canonical personal CRM; legacy deals routes redirect to the authorized fundraising/portfolio views. Founder analytics aggregates only the current user's rounds in the active workspace and keeps currencies separate. |
| XLSX import | New founder workbooks have one authoritative **Import Selection** sheet. Legacy workbooks use exclusion-wins semantics across repeated identities. Upload displays the selected list before importing. Imports are atomic, preserve new-row Status/Owner/Notes, and use a database identity constraint and insert trigger to prevent new duplicates, including concurrent uploads. |
| Deck Studio | Replaced the Figma workflow with a native slide editor, company/round or authorized fund context, saved revisions, conflict detection, sample templates, and PowerPoint/PDF/Word downloads. Retired Figma endpoints return 410 without reading fund context. |
| Investor updates | Send atomically persists the reviewed content and recipient snapshot. Retries use that immutable snapshot and stable tracking/message/idempotency identifiers. Missing provider configuration never records a send. Partial failures, suppression and expired send leases have explicit states. |
| Generated artifacts | Consolidated the two artifact writers into private, database-backed storage with owner, active-workspace and expiry checks. Downloads no longer depend on a public directory, temporary instance, or unauthenticated Blob proxy. Four previously tracked generated files were moved outside the public directory. |
| Runway/Cap Table | Added saved workspace scenarios and revision checks. Positive operating cash flow increases cash; no depletion inside the modeled period displays “Beyond 36 months.” Invalid dilution is rejected. The ESOP field now explicitly means the target post-round pool; a lower target does not cancel existing options. |

The new planning and deck editors identify sample data, show unsaved changes, preserve edits after failed requests, and disable writes for viewers. Runway includes a monthly data table, theme-aware chart colors, and reduced-motion handling.

## Deck samples

Original Anker templates with sample prompts, not claims about a real company's traction or fund performance:

| Sample | Slides | Download files |
| --- | --- | --- |
| Founder pitch | 8 | `docs/deck-studio-samples/founder-pitch.pptx`, `.pdf`, `.docx` |
| Investor update | 6 | `docs/deck-studio-samples/investor-update.pptx`, `.pdf`, `.docx` |
| Fund overview | 8 | `docs/deck-studio-samples/fund-overview.pptx`, `.pdf`, `.docx` |

The app generates these formats using PptxGenJS, pdf-lib and docx. PDF embeds OFL-licensed Geist fonts through `@pdf-lib/fontkit`; the license and fonts ship with the repository. PowerPoint and PDF use the silver Anker logo. Word is a readable brief with slide content and speaker notes, rather than a slide-shaped document.

PDF generation reports overflow or unsupported characters instead of silently dropping content. For scripts beyond the embedded font's coverage, the UI offers PowerPoint or Word. Sample metrics remain prompts until the user supplies verified content. Selecting context saves its association and does not invent or overwrite slide facts.

Rebuild the sample files:

```bash
ANKER_WRITE_DECK_SAMPLES=1 pnpm exec vitest run lib/decks/studio-export.test.ts
```

## Database migration

Apply this migration **before** deploying the new application code:

```bash
node scripts/oneshot/run-migration.mjs scripts/migrations/2026-09-12-founder-workflow-integrity.sql
```

The migration assumes the existing organizations/memberships, CRM boards/entries, fundraising rounds, and investor-update migrations are already applied, including `2026-09-11-investor-update-delivery-state.sql`. Use the repository's migration-status command to check the environment first:

```bash
node scripts/oneshot/run-migration.mjs --status
```

The raw SQL file is also suitable for the database SQL editor. It creates `workspace_decks`, `planning_scenarios` and `private_artifacts`, adds canonical import identity to CRM entries, and adds the investor-update delivery snapshot, revision and lease fields.

Re-running the migration was tested against an isolated SQL database. It preserves legacy Figma rows and historical CRM duplicates rather than deleting potentially different notes, activity or round links. The earliest historical row becomes the canonical target for future re-imports. Existing duplicate cleanup therefore remains an explicit data-reconciliation task.

## Storage and delivery operations

- Artifacts are private to their author in the active workspace. Each is limited to 20 MB and downloadable for 30 days. Database backups now include those bytes. Expired bytes can be purged with `DELETE FROM private_artifacts WHERE expires_at < now();`; schedule this using the deployment's existing maintenance mechanism if needed.
- Old `/generated/...` and unowned artifact links are intentionally unavailable. Users should regenerate a file in its original workspace. There is no reliable ownership metadata with which to automatically migrate arbitrary historical files.
- The native studio uses new workspace records. Existing Figma projects remain in the old tables and require a separate, owner-verified import if their content should be carried over.
- Update delivery uses bounded requests and renewable leases. A retry resumes the saved recipient set and skips already sent/suppressed recipients. It is initiated from the update screen; this change does not install an autonomous queue worker.
- Retries stop after 20 hours and request provider reconciliation. This is deliberately inside Resend's documented 24-hour idempotency window. See [Resend idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys). This is not a claim of indefinite exactly-once delivery.
- Keep sender configuration stable during a retry window. Reconcile uncertain provider outcomes before changing that configuration or starting a replacement campaign.

## Verification

- SQL integration tests exercise actual route handlers and migrations using isolated PGlite/PostgreSQL semantics. Authentication identities and provider delivery are simulated; no production data or real email is involved.
- Covered active-workspace and owner isolation, foreign round selection, read-only users, concurrent scenario saves, persisted deck context, private artifact access/expiry, preview without mutation, repeated/concurrent import, missing provider configuration, partial delivery, immutable retry identity, concurrent sends, all-suppressed delivery, and expired-lease recovery.
- React DOM interaction tests exercise scenario saving, deck-context saving, edited-message sending and deselecting all recipients.
- Sample exports are reopened as PDF/Office files. Tests check PDF page count, slide count, titles, response headers and output formats. Rendered founder PDF cover/content were visually inspected; embedded fonts corrected a rendering problem detected in the first output.
- The full automated test count and final build result are recorded in the completion notes below.

## Remaining release gates and scope limits

- Signed-in desktop/mobile browser verification against the deployment, including dark mode and focus behavior. Local Chromium download failed, so this pass does not claim real-browser verification.
- Verify the migration and database role/storage limits in the target environment.
- Send provider-sandbox messages through the deployed configuration and verify receipts, suppression and restart recovery.
- Open sample PowerPoints in the user's target PowerPoint/LibreOffice installation. These applications were not available for visual inspection here.
- Historical duplicate reconciliation, legacy Figma content import, and unowned historical artifact migration are intentionally not automatic.
- Cap Table models priced rounds and target ESOP top-ups; SAFE/note conversion is not included. Each user currently has one saved scenario per tool per workspace.

## Completion notes

- Final full suite: **236 tests passed across 43 files** (`pnpm exec vitest run`).
- TypeScript passed, including the route types generated by Next.js (`pnpm exec tsc --noEmit --pretty false`). This exposed an unused helper export in the LP campaign import route; making it private restored the valid route contract without changing the import behavior.
- Optimized Next.js webpack compilation and build tracing succeeded with `pnpm exec next build --webpack --experimental-build-mode compile`. This was compile mode, not a finalized production build or a deployment. The final PDF bounds guard and minor editor/import changes were checked by the subsequent test suite and TypeScript pass.
- All nine sample documents were regenerated after the font/logo changes. A regression test now rejects PDF text that would extend beyond the slide width.
- No production migration, real provider delivery, or GitHub push was performed in this implementation pass. The browser and target-office-application checks above remain release gates.
