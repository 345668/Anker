# Founder navigation and platform audit — 10 September 2026

This pass audits the route catalog, persona navigation, shared shell, feature
engines, and UI state conventions after the matchmaking contract work. It is a
static/code audit plus automated verification; it is not a browser-certified
production penetration test.

## Inventory

- 198 application pages: 152 dashboard pages, 3 LP portal pages, and 46 public/auth pages.
- 373 API route handlers.
- One in-app navigation source: `lib/nav/taxonomy.ts` + persona work areas in `lib/nav/work-areas.ts`.
- Shared desktop rail, mobile sheet, top bar, command palette, theme toggle,
  and workspace switcher are composed by `app/dashboard/layout.tsx`.

## Founder navigation preview

The founder rail is intentionally responsibility-based rather than a flat
feature list:

| Work area | Destinations |
| --- | --- |
| Fundraising | Fundraising pipeline, Discover, Find Investors, Market Signals |
| Relationships | CRM, Network, Call Intelligence, Investor Updates |
| Outreach | Email outreach plus LinkedOut campaigns, leads, inbox, review, senders, analytics, suppression, extension |
| Company | Cap Table, Runway, Share Plans, 409A, Compensation, Equity Compliance, Term Sheet, Tools, Analytics |
| Documents | Data Room, Decks, Documents |
| Assistant | Assistant and ANKER AI |

Desktop and mobile now consume the same taxonomy, preserve active-route
highlighting, expose a keyboard-searchable command palette, and return focus to
the menu trigger after a mobile sheet closes.

## Corrections implemented in this pass

1. Added server-side persona guards to founder/VC pages that previously relied
   on a client navigation filter only: analytics, AI surfaces, CRM, data room,
   decks, discovery, documents, investor matching, investor directory, network,
   outreach, pitch deck, runway, signals, term sheet, updates, cap table, calls,
   and the legacy deals route.
2. Added a shared guard for `/dashboard/tools/*`, so calculator pages require a
   founder or fund-manager workspace.
3. Added a shared guard for `/dashboard/linkedin/*`, so LinkedOut pages require
   an authenticated workspace persona while remaining available to founders,
   VCs, and LPs.
4. Added a VC guard to the LP campaign studio.
5. Removed staff/admin-only destinations from the ordinary VC rail:
   `/dashboard/campaigns`, `/dashboard/portfolio`, and
   `/dashboard/portfolio/compliance`. They remain available through their
   explicit Owner Console/admin paths.

## Feature and engine review

| Surface | Current state | Primary mismatch / next action |
| --- | --- | --- |
| Find Investors | Real founder flow: deck/data-room upload, additive extraction, readiness gate, deterministic/AI matching, exports and CRM handoff | Run authenticated browser journey at 375/768/1440px; verify extraction with image-only PDFs and provider outage |
| LP Matchmaking | Real VC flow: canonical fund profile, readiness gate, v2 scorer, durable completed-session exports | Apply migration before rollout; complete end-to-end run against a non-demo fund and verify fund-specific authorization |
| CRM / outreach | Real relationship and delivery engines with retry/error states in core paths | Finish keyboard dialog/Kanban interaction audit; unify all delivery statuses under one state model |
| LinkedOut | Approval-gated campaign, review queue, unibox, sender caps, suppression and analytics | Browser-test extension reconnect, approval failure, and retry paths; verify all pages use workspace scope |
| Call Intelligence | Real capture/sync/analyze/download path | Validate local-device permission fallback and transcript upload limits on mobile |
| Data Room / documents | Real founder room, requests, sharing and engagement surfaces | Confirm founder-company resolver behavior for membership changes and empty-state consistency |
| Fund OS | Deep fund admin modules behind active-fund authorization | `/dashboard/portfolio` and several reporting pages still contain admin/MVP constraints; finish multi-fund workspace resolution before exposing them to customer VCs |
| LP portal | Capital activity, documents and calls are live | LP onboarding and full capital-account workflow remain incomplete |
| AI assistant / research | Assistant, ANKER AI, thesis enrichment and deep-research engines exist | Make provider availability, loading, failure and cost states consistent across every AI entry point |
| Toolbox | Native calculators and exports are real | Add shared persona/entitlement messaging for unsupported calculators and validate reduced-motion behavior on charts |

## Remaining high-priority mismatches

- **Fund OS access model:** `app/dashboard/portfolio/page.tsx` is still
  admin-gated and hardcodes `svs-fund-ii`; it must resolve the active authorized
  fund from workspace membership before becoming a customer-facing VC entry.
- **Owner Console discoverability:** staff-only imports, newsroom CMS,
  enrichment, email-check, crawl, deep research, billing, audit and user tools
  should be grouped under an explicit staff surface, not mixed with customer
  navigation.
- **Shared mutation state:** audit every remaining POST/PATCH action for
  optimistic success before the API confirms; failed delivery must remain
  retryable and must not be marked sent.
- **Filter contracts:** Discovery still mixes server filters and loaded-page
  filters. Add server-derived facets and filtered totals so a founder can find
  records outside the first page.
- **Keyboard overlays:** CRM contact detail and Kanban interactions need the
  same managed focus, Escape, semantic dialog, and non-drag keyboard path now
  present in the mobile sheet and command palette.
- **Visual consistency:** standardize loading, empty, error, retry and reduced-
  motion states through `DataState`/`EmptyState`; review light-mode input
  borders and disabled controls on every feature page.
- **Dead/legacy surfaces:** retain redirect stubs only where they preserve a
  known external link; otherwise label or remove `/dashboard/pipeline`, the old
  `/dashboard/deals`, `/dashboard/investors`, and `/dashboard/pitch-deck`
  duplicates after confirming analytics/bookmarks.

## Verification

`pnpm typecheck` passes. The full Vitest suite passes: **34 files, 173 tests**.
The Next production build and authenticated browser pass remain deployment
checks; a build attempt was blocked by the environment usage quota in this
session.

## Follow-up implementation pass — 11 September 2026

The remaining high-priority mismatches identified above were addressed in the
current branch:

- Discovery initial render, SWR pagination, and URL filters now share one SQL
  contract. Search, stage/type/sector/country filters, email/LinkedIn presence,
  and check-size ranges are applied before pagination. Facets are derived from
  the complete source, and totals are filtered totals rather than the number of
  records currently loaded in the browser. The parser accepts the ranges shown
  in the UI (`$10K-$50K`, `$100M+`, etc.).
- CRM contact detail sheets explicitly remember their opener and return focus
  after Escape or close. Kanban cards retain drag-and-drop and expose a labelled
  stage select for keyboard and touch users.
- Investor-update delivery claims a draft before sending, uses stable provider
  idempotency keys, records skipped/failed attempts, avoids duplicate successful
  recipients, and returns the update to `draft` or `partial` when a provider
  fails. Those states remain sendable, so a failed delivery cannot be presented
  as sent.
- Owner Console links remain grouped in the explicit Administration section of
  the desktop and mobile shells; staff-only operations are not added to persona
  work areas.

The follow-up adds discovery integration tests and delivery-state coverage. The
complete local suite now passes **207 tests across 38 files** and
`pnpm typecheck` passes. A production build and authenticated browser run remain
deployment checks.
