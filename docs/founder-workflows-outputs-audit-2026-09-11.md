# Founder workflows and output audit — 2026-09-11

Repository: `345668/Anker`

Branch: `feat/anker-editorial-website`

Audited application revision: `b3833d9`

Previous assessment: `docs/founder-navigation-platform-audit-2026-09-10.md`

Implementation follow-up: `docs/founder-integrity-implementation-2026-09-12.md` records the fixes and remaining release gates. Findings below describe the audited revision; the probe script now exercises the updated selection parser while retaining an explicitly labeled baseline migration comparison.

## Assessment

Founder navigation has improved, but several journeys still break between the screen, the API, and the generated deliverable. The immediate priorities are authorization, reliable shortlist re-import, Deck Studio context, and investor-update send integrity. Visual polish should follow those corrections so that a finished-looking screen also produces a dependable result.

This is a repository audit with synthetic output probes and focused automated tests. It is not a signed-in production browser audit. No production database changes, real email deliveries, paid AI requests, or external extension operations were performed. Findings described as code-confirmed establish implementation behavior; they do not establish that production data has been accessed improperly.

## Verification completed

- Five focused Vitest files passed: **22 tests** covering matching forms, workspace interactions, matching contracts, fundraising rounds, and update delivery state.
- Generated a founder workbook using the actual builder, serialized it, reopened it, and inspected its worksheet XML.
- Invoked the actual SaaS forecast export handler with synthetic inputs and no session.
- Applied the CRM entries migration to a fresh, in-memory PGlite database and tested the nullable identity constraint.
- Checked legacy LP CSV quote handling using synthetic data; this is an adjacent export finding, not a founder-specific journey.

Reproduce the probes from the repository root:

```bash
node scripts/audits/founder-output-probes.cjs
```

Reproduce the focused tests:

```bash
pnpm exec vitest run lib/platform/matching-forms.test.ts lib/platform/workspace-interactions.test.ts lib/matching/matching-contract.integration.test.ts lib/fundraising/rounds.integration.test.ts lib/updates/delivery-state.test.ts
```

The probes record current behavior; they are not regression assertions that consider defective behavior acceptable. They do not exercise the complete authenticated import route. The duplicate finding combines actual workbook output, importer code inspection, and an isolated migration test. Deployed schema parity remains to be checked.

| Probe | Observed result | Implication |
| --- | --- | --- |
| Deselect a contact on Investor Contacts | Its Ready to Email copy remains selected | The importer can still import that contact |
| Insert the same firm twice with a null investor ID | Two rows | Existing conflict handling does not guarantee deduplication |
| SaaS export without a session | HTTP 200 | Dashboard authentication does not protect this API |
| SaaS starting MRR input cell | String `$1,000` | Display formatting replaces a numeric input |
| SaaS workbook formulas | Zero | Workbook is a static snapshot, not a recalculating model |
| Founder workbook frozen panes after serialization | None | In-memory freeze settings do not survive the actual writer |
| LP CSV containing embedded quotes | Quotes not escaped | Names containing quotes can corrupt CSV structure |

## Priority findings and acceptance checks

### F01 — P0: Legacy contacts/deals queries are not scoped to the signed-in founder

**Evidence:** `app/dashboard/analytics/page.tsx`, `app/dashboard/crm/table/page.tsx`, `app/dashboard/deals/table/page.tsx`, and `lib/db/platform-queries.ts` (`getContacts`, `getDeals`). These queries omit owner/company/workspace predicates. The shared SQL driver does not establish a per-request user context. Authentication and persona navigation do not supply the missing row scope.

**Impact:** A signed-in user can reach screens backed by global contacts/deals queries. The contacts table describes these as “Your relationship graph” and offers export. Analytics also presents capped samples of 500 deals and 200 contacts as totals. Shared investment-firm directory data is intentionally distinct from private contacts/deals and is not itself evidence of a privacy defect.

**Fix:** Replace legacy data access with explicitly authorized queries. Define whether each screen is personal, company, or round scoped; calculate aggregates over that scope in SQL. Remove incompatible legacy routes or redirect them to the canonical founder CRM.

**Acceptance:** Seed users in two organizations and verify page payloads, totals, search, and CSV contain only authorized private data. Test direct URLs and command-palette links, not only sidebar visibility. Counts must remain correct above the current fetch limits.

### F02 — P0: Deck ownership does not authorize the referenced fund

**Evidence:** `app/dashboard/decks/[id]/page.tsx` loads up to 200 funds without a membership filter. `app/api/decks/route.ts` accepts a caller-supplied `fundId`. Generate, mapping, and payload routes call `lib/decks/context.ts::buildFundContext`, which queries that fund and its portfolio without validating the user's access to it.

**Impact:** A user-owned deck can reference an unauthorized fund; fund names and fund-derived content lack a consistent authorization boundary. The earlier portfolio authorization fix does not cover this separate path.

**Fix:** Resolve permitted context server-side for create, update, generation, mapping, payload, and page rendering. Founders need company/round context; VC users need authorized active-fund context. Checking deck ownership alone is insufficient.

**Acceptance:** With two funds and separate members, foreign fund IDs must fail before any context is read or sent to an AI provider. Repeat through extension endpoints. Switching active workspace must not expose the prior workspace's fund options or context.

### F03 — P0: Artifact downloads lack ownership checks

**Evidence:** `app/api/artifacts/[file]/route.ts` validates the filename but performs no session or ownership check before proxying a private Blob or reading disk. `Cache-Control: private` controls caching, not access. `lib/assistant/artifact.ts` and the separate writer in `lib/assistant/tools.ts` do not associate the download with an authorized user/workspace record.

**Impact:** Possession of a generated filename is sufficient to request an artifact. Private Blob storage does not repair an unauthenticated proxy route. This is a code-confirmed boundary defect, not evidence of an observed data breach.

**Fix:** Store artifact ID, owner, scope, storage key, format, generation state, and expiry. Authorize downloads against this metadata; implement explicit sharing separately. Review the four tracked files in `public/generated` for unintended publication.

**Acceptance:** Anonymous and unrelated users cannot retrieve private artifacts even with the exact identifier. Authorized downloads still work after a cold start and deployment. Revoked access is enforced.

### F04 — P1: Export APIs bypass the platform's access and validation gates

**Evidence:** `app/api/tools/[slug]/export/route.ts` dispatches twelve workbook builders without authentication, persona checks, per-tool input schemas, or workload bounds. The real SaaS handler returned 200 without a session. `app/api/fund-deck/docx/route.ts` also lacks authentication; its multipart mode can invoke paid deck analysis. This is an adjacent fund endpoint sharing the platform's output surface.

**Fix:** Apply server-side access policy, bounded schemas and request limits before computation. Reuse analysis authorization/rate controls for the DOCX multipart path. Return field errors for invalid inputs and appropriate private download cache policy.

**Acceptance:** Test anonymous requests, unauthorized personas, malformed JSON, excessive horizons/rows, non-finite values, invalid PDFs, and provider failure. Invalid requests must not invoke expensive builders/providers. The Tools page layout already checks personas; retain that gate, but protect the API independently.

### F05 — P1: XLSX selection does not survive re-import predictably

**Evidence:** `lib/matching/v2/founder-xlsx.ts` repeats contacts on Investor Contacts and Ready to Email, and firms on lead and firm sheets. Copies are selected by default. `app/api/crm/import-shortlist/route.ts` processes every sheet independently. The probe confirms a contact remains eligible after being deselected on its main sheet.

**Impact:** A founder following “uncheck rows you don't want to contact” can still import unwanted investors.

**Fix:** Establish one authoritative selection table keyed by stable investor identity. Make other sheets reference views or define explicit conflict resolution. Show a preview of selected, excluded, conflicting, existing, and invalid records before import.

**Acceptance:** Export, deselect across the supported editing surface, save, and import. Each identity must follow the preview exactly. Include conflicting sheet copies, reordered sheets, blank rows, and TRUE/FALSE values. State clearly how selection is edited; booleans are not Excel checkbox controls.

### F06 — P1: CRM imports are neither reliably idempotent nor transparent

**Evidence:** `scripts/migrations/2026-05-04-crm-entries.sql` uses a composite unique constraint containing nullable IDs. The importer relies on that constraint's `ON CONFLICT`; two identical firm inserts with `investor_id = NULL` succeed in the probe. It creates/resolves a board before validating usable workbook headers, swallows board-resolution errors, and counts insertion failures as skipped. Workbook Status/Owner/Notes edits are not preserved by the importer.

**Fix:** Define canonical identity and intended deduplication scope before migrating. Account for existing duplicates without silently losing notes or round associations. Validate workbook version/headers first, require a valid target board, and return actionable row outcomes. Either support editable columns or mark them as export-only.

**Acceptance:** Re-import twice and concurrently; each selected identity is represented according to the agreed board/round policy. Invalid files create no empty board. Database failures roll back or produce an explicit recoverable partial result. Test existing duplicates and unaffiliated contacts as migration fixtures.

### F07 — P1: Round write permissions depend on an optional client field

**Evidence:** `app/api/crm/entries/[id]/route.ts` checks active founder membership and viewer restrictions only when `body.roundId` is supplied. A caller can omit it and update their own round-linked CRM entry. DELETE checks the entry's user owner but not its linked round permissions. `boardId` changes do not validate the target board's ownership in this route.

**Impact:** The protected round screen and generic CRM API enforce different rules over the same record. This is not an unrestricted cross-user edit: the user-owner predicate remains, but workspace/round restrictions can be bypassed for owned rows.

**Fix:** Derive round and board scope from stored relationships, then authorize the mutation. Validate source and destination boards. Define explicit semantics for clearing a board instead of relying on COALESCE.

**Acceptance:** A viewer cannot update or delete a protected round-linked entry through the CRM API with or without `roundId`. Test switching organizations, foreign board IDs, moving between boards, and clearing board assignment.

### F08 — P1: Deck Studio cannot reliably persist context or finish a founder deck

**Evidence:** `components/decks/decks-catalog.tsx` creates a deck without a fund. `components/decks/deck-detail.tsx::setFund` optimistically updates local state and PATCHes `{fundId}`, but `lib/decks/decks.ts::updateDeck` does not update `fund_id`. Generate reloads the persisted deck and rejects it with “Deck has no fund.” The founder-facing workroom is organized around fund context, rather than company/round context. Generation catches individual slot failures and can still mark the deck filled with zero successful generations.

**Fix:** Implement the founder context contract alongside F02. Persist validated context and return canonical saved state. Distinguish ready, generating, partial, failed, and completed outputs. Never present completion solely because the request loop finished.

**Acceptance:** Start from the catalog, select an authorized company/round, save, reload, generate, inspect, and download/apply a deck. Test zero successful slots, partial output, missing context, and provider timeout. Extension/Figma application requires a separate real integration check.

### F09 — P1: Investor updates can send stale content and report misleading delivery states

**Evidence:** `components/updates/update-builder.tsx` keeps edits locally; Send does not save them or pass their content. `app/api/updates/[id]/send/route.ts` sends the saved database version. The UI permits editing partial updates, while the PATCH API permits only drafts. The send route skips provider calls when Resend is unconfigured but still records recipient `sent_at` and marks the update sent. Retries can recompute recommendations instead of using an immutable original recipient set. The route claims `sending` before additional operations without an outer recovery mechanism for unexpected failures.

**Fix:** Send a reviewed, persisted revision with an immutable recipient snapshot. Make delivery configuration failure explicit. Retry only eligible failed/pending recipients, preserve actual delivery outcomes, and recover stale send claims using a durable job/lease. Align partial-edit behavior across UI/API.

**Acceptance:** Edit then Send delivers exactly the reviewed revision. Missing provider configuration never records a send. Test mixed success/failure, suppression, concurrent requests, changed CRM recommendations, provider timeout, and DB failure after a provider response. Existing delivery-state tests passing does not validate these full sequences.

### F10 — P1: Generated artifact links can depend on a temporary server instance

**Evidence:** `lib/assistant/tools.ts` has its own disk-only `saveArtifact`, used by investor exports, outreach drafts, spreadsheets, documents and presentation tools. Its serverless fallback uses `/tmp`. The separate Blob-aware writer in `lib/assistant/artifact.ts` can also fall back to disk after upload failure.

**Impact:** Successful generation can be followed by a missing download on another instance. The two writers have different persistence guarantees.

**Fix:** Consolidate the writers with F03. In hosted production, only mark generation ready after durable storage succeeds. Retain a clearly bounded local-development fallback.

**Acceptance:** Generate on one process and retrieve from another; repeat after restart and storage failure. A failed upload produces a retryable failed generation, never a ready link that immediately disappears.

### F11 — P1: Primary deck-upload entry point is a placeholder

**Evidence:** The founder quick-start points to `/dashboard/pitch-deck`. `components/tesseract/pitch-deck-content.tsx` renders a hidden file input and upload-looking region without a working selection/drop/analysis flow. Its PDF/PPT/PPTX 50 MB promise differs from the implemented matching analysis upload contract.

**Fix:** Connect the entry point to the working extraction/analysis flow and its actual supported formats/limits, or redirect to the canonical flow while completing this screen. Preserve manual form entry when extraction fails.

**Acceptance:** From the founder home page, select/drop a supported deck, see progress and field review, resolve missing required fields, run matching, and retrieve outputs. Unsupported files fail before upload with accurate instructions.

### F12 — P1: Planning pages can lose work and present unreliable scenarios

**Evidence:** `components/tesseract/runway-content.tsx` and `cap-table-content.tsx` initialize editable scenarios in component state without persistence. Runway subtracts `Math.max(0, burn - revenue)`, so positive operating cash flow never increases cash. No exhaustion within the horizon is converted to `horizon + 1` and displayed as a finite runway. Cap Table substitutes `totalShares * 1.5` when its dilution denominator is invalid.

**Fix:** Add explicit saved scenarios or prominently label unsaved previews, with recovery. Correct cash-flow projection and distinguish “beyond modeled horizon” from an observed exhaustion date. Reject invalid dilution assumptions rather than manufacture a fallback result.

**Acceptance:** Save/reopen across reload and workspace switch; validate access. Test cash-positive scenarios, no depletion within horizon, zero cash, and impossible ownership/pool combinations against hand-calculated fixtures. This audit concerns implementation correctness, not advice about investment decisions.

### F13 — P2: Spreadsheet outputs need a consistent, honest contract

**Evidence:** The actual founder XLSX contains no serialized frozen pane despite in-memory settings. SaaS Inputs stores starting MRR as formatted text; the produced workbook has no formulas. Those outputs can be useful snapshots, but are not editable recalculating models. Founder selection sheets combine sections and filterable rows, which requires care when sorting.

**Fix:** Choose and label snapshot versus model per tool. Keep numeric money/percent/date values typed and apply number formats. Add generation timestamp, scope, currency, assumptions, and schema version. Use a writer that supports required panes/styles; verify serialized bytes instead of only workbook objects. Provide a single authoritative import sheet under F05.

**Acceptance:** Open in Excel and LibreOffice; verify numeric types, filters, panes, long names, zero values, non-ASCII characters, and empty outputs. Formula-backed models must recalculate when inputs change; snapshots must say that they do not. Verify displayed totals match exported totals and active filters.

### F14 — P2: CSV and download boundaries need format-specific validation

**Evidence:** `components/data/data-table.tsx` escapes CSV quotes but does not neutralize formula-like user strings. The adjacent legacy `lib/matching/xlsx-generator.ts::generateLpContactsCsv` fails the embedded-quote probe. Neither probed CSV path establishes an Excel-friendly BOM contract. The founder critique DOCX route interpolates supplied filename content directly into Content-Disposition; Unicode/header edge cases need dedicated validation. Native XLSX headers already provide an ASCII fallback and RFC 5987 filename support and should be reused, not replaced with a weaker pattern.

**Fix:** Centralize CSV escaping and formula-text handling, define UTF-8 behavior, and centralize safe download filenames across formats.

**Acceptance:** Round-trip names with quotes, commas, newlines, accents and non-Latin text. Formula-like text remains literal when opened in a spreadsheet. Filenames containing non-Latin characters or control characters never cause a response-header exception.

### F15 — P2: UI state and accessibility inconsistencies remain in active journeys

**Evidence:** ShortlistUploader's “Open CRM” links to `/dashboard/outreach`; its drop copy is not backed by drop handling. Investor-update detail ignores fetch errors and can show an indefinite spinner; save does not check response success. Signals can show an error alongside “No signals yet.” Tool export failures use raw alerts and incomplete network-error handling. ToolField labels are not consistently associated with controls. Founder charts include hardcoded light tooltip styling; active Recharts pages do not explicitly integrate reduced-motion preferences.

**Fix:** Use consistent loading/error/empty states with actionable retry, truthful save/send feedback, and a stable destination after import. Associate labels and validation messages with inputs and focus the first invalid field. Use theme tokens for charts and explicitly disable JS chart motion when requested.

**Acceptance:** Verify at 320/375 px and desktop, in light/deep-blue dark mode, with keyboard-only navigation and reduced motion. Test failed fetch, failed save, slow upload, empty results, and expired sessions. Test mobile sheet focus containment, Escape, and focus return in an actual browser as well as automated tests.

Global platform CSS already reduces CSS animation/transition motion. Individual CSS spinners lacking a local motion class are not independently counted as defects. The older Galaxy network component was not established as the active route, so its RAF behavior is not presented as a current founder-page failure.

## Workflow coverage and remaining verification

| Founder journey | Repository assessment | Remaining verification |
| --- | --- | --- |
| Workspace and persona navigation | Earlier guards retained; Tools and LinkedOut have shared layout guards | Real multi-membership switching and deep-link browser checks |
| Home → deck → company profile | Upload entry point broken; matching extraction has additive fill and manual fallback | Real supported files, progress, cancellation, and recovery |
| Find Investors → shortlist | Required-field/readiness contracts covered by focused tests | Live data/provider quality, mobile field focus, expired sessions |
| XLSX → CRM → fundraising round | Selection ambiguity, nullable deduplication, optional round gate | Full route tests with two organizations and concurrent import |
| Discovery and personal CRM | Shared filtered discovery queries and improved mutation errors present | User-specific browser fixtures and table/export consistency |
| Analytics and legacy tables | Global query paths require correction | Negative scope tests and accurate large-data aggregates |
| Investor updates | Stale content, partial-state and send recovery gaps | Real provider sandbox delivery and durable retry recovery |
| Deck Studio | Context persistence and authorization defects | Founder end-to-end generation and actual extension application |
| Runway and Cap Table | Local-only state and calculation issues | Persistence and numerical fixtures, accessible charts |
| Assistant files and exports | Authorization/durability split across writers | Cross-instance downloads, access revocation, Excel/LibreOffice checks |
| Call Intelligence | Workspace binding, approval/consent and import retry provisions found | Desktop install, consent, recording/sync, offline recovery with test users |
| Remaining integrations, equity modules, data room | Not exhaustively executed in this pass | Separate end-to-end cases with authorized test fixtures |

The inventory includes 152 dashboard page files; that is a route inventory, not a claim that every page or external engine passed an end-to-end test. No live McKinsey comparison or signed-in visual inspection was performed in this pass. The UI assessment is based on implementation and the established editorial/deep-blue design direction.

## Recommended implementation order

1. **Close authorization boundaries:** F01–F04 and F07. Protect private reads, referenced context, downloads, and direct API entry points.
2. **Make the core fundraising round trip reliable:** F05–F06 and F11. One deck/profile entry flow, one authoritative selection, deterministic imports, explicit board/round linkage.
3. **Make work and delivery durable:** F08–F10 and F12. Persist validated context/scenarios, send reviewed revisions, recover jobs, and store artifacts durably.
4. **Finish output and interface quality:** F13–F15. Typed spreadsheets, consistent file contracts, truthful UI states, theme/accessibility verification.

Add regression tests when implementing each fix, targeting the failing cross-layer behavior. Keep existing protections for matching-session ownership, active organization, viewer roles, manual profile input, and call consent. Real multi-workspace/browser/provider tests remain release gates; the 22 passing focused tests do not replace them.

## Changes made in this audit pass

Only this report and `scripts/audits/founder-output-probes.cjs` were added. Application code was not changed, migrations were not applied to a remote database, and this audit was not pushed to GitHub.
