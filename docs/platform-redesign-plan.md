# Anker Platform Redesign — Plan

**Goal:** retire the tall, 40-item sidebar and rebuild the in-app shell around the
same navigation model, typography, and voice as the marketing site
(an-ker.de) — a top bar with **Products** / **Solutions** mega-menus, house
serif display headings, mono eyebrows, generous whitespace, and the red-medallion
brand. The app should feel like the logged-in continuation of the website, not a
different product.

Status: **planning** (no code yet). Logo render bugs already fixed separately
(`fix(brand): unique gradient ids per logo + legible sidebar lockup`).

---

## 1. Why change

- **The sidebar doesn't scale.** It already holds ~40 items across 8 unlabeled-to-
  the-user groups (Overview, Source & Match, Relationships, Fund, Equity, LP,
  Documents, Tools) plus Account and an Admin console. New engines (Loans, 409A,
  Share Plans) keep lengthening it. Founders see a wall they don't need.
- **It doesn't match the website.** The marketing site navigates by **suite**
  (Founder Suite, Fund OS, Investor Room) and **audience** (Founders, VCs, LPs).
  The app navigates by internal feature grouping. A user who clicked "Cap Table"
  under *Anker Founder Suite* on the site lands in a different mental model.
- **Persona is already the organizing principle** — every nav item is tagged
  `personas: ["founder" | "vc" | "lp"]`. We should surface that structure, not
  bury it in one long list.

## 2. Target navigation model

Mirror the site's information architecture exactly, reusing its wording.

### 2.1 Top bar (replaces the sidebar)

```
[◉ ANKER · Venture OS]   Home   Products ▾   Pipeline   Relationships   ⌘K   ☀/☾  Tasks  Downloads  [PH ▾]
```

- **Left:** brand lockup (`outline` variant in-app) → links to `/dashboard`.
- **Center/primary nav:** a small set of top-level entries + one or two
  mega-menus. The heavy content lives in the mega-menu, exactly like the site.
- **Right (existing `DashboardTopbar`):** ⌘K command palette, theme toggle,
  Tasks tray, Downloads tray, user menu. This bar already exists and stays.

### 2.2 The "Products" mega-menu (persona-scoped)

Reuse the site's three suites verbatim as the column structure, but render only
the suite(s) the active workspace persona is entitled to. The panel is the
website's `SUITES` array, pointed at `/dashboard/*` routes instead of `/products/*`.

| Suite (site wording) | Persona | In-app destinations (existing routes) |
|---|---|---|
| **Anker Founder Suite** — "Raise your round. Model the deal. Share with confidence." | founder | Find Investors `/dashboard/find-investors`, Discover `/dashboard/discover`, Cap Table `/dashboard/cap-table`, Share Plans `/dashboard/share-plans`, 409A `/dashboard/valuations-409a`, Runway `/dashboard/runway`, Raise Pipeline `/dashboard/fundraising/pipeline`, Data Room `/dashboard/data-room` |
| **Anker Fund OS** — "ERP for private capital." | vc | Fund `/dashboard/portfolio/fund`, Performance `/…/performance`, Financial Reporting `/…/reports`, Data Explorer `/…/explorer`, Deal Flow `/…/deals`, LP Matchmaking `/dashboard/matchmaking`, SPVs, Loan Operations, KYC/AML, Fund Tax, Contracts, Compliance |
| **Anker Investor Room** — "Self-serve LP portal." | lp | Capital Account `/lp`, Distributions & Calls `/lp/distributions`, Documents `/lp/documents`, Portfolio Analytics |

> The current sidebar's group labels (Fund, Equity, Relationships…) become the
> **sub-headers inside each suite column**, so nothing is lost — it's re-shelved,
> not removed.

### 2.3 Remaining top-level entries

Keep the two or three highest-frequency destinations as direct links so common
work is one click, not a menu dive:

- **Home** → `/dashboard` (the quick-start + spotlight + tasks board that exists today)
- **Relationships** → CRM / Network / Outreach (the site has no exact analog; this
  is the daily workspace, so it earns a top slot rather than living in a menu)
- **AI** → AI Assistant `/dashboard/assistant` + ANKER AI `/dashboard/anker-ai`
  (badged, as today)

Everything else lives under the Products mega-menu.

### 2.4 Command palette is the power-user path

`⌘K` already exists (`CommandPalette`). With a shallower top bar, the palette
becomes the primary way to jump to any of the 40 destinations by name. Invest here:
make sure every route is registered with its site-wording label and persona.

## 3. Visual language (match the site)

Pull directly from the marketing components so the app inherits the same tokens.

- **Type:** serif display for page titles ("Fund administration, done right"),
  `font-mono` uppercase eyebrows with the small red square bullet
  (`■ PRODUCTS & FEATURES`), muted body. The app already has `font-display`;
  standardize a `PageHeader` that matches the site's section header.
- **Color:** keep the founder vermilion `#e5380f` / VC cobalt `#2f45e0` accents;
  adopt the site's near-black dark surface and off-white light surface. The
  red-medallion logo stays for marketing; in-app uses the `outline` mark.
- **Cards:** the site's bordered, dotted-grid feature cards and the stat tiles
  ("NET IRR 24.5% ↗ +3.1 · TVPI 1.58×") — reuse for dashboard spotlights and
  module summary tiles (loans/409A/share-plans tiles already follow this).
- **Motion:** the site's staggered, offset feature rows and the underline-on-hover
  wordplay ("ready to _scale_"). Light touch only in-app.

## 4. Wording pass (site → app)

Rename in-app labels to the site's language so the two surfaces speak identically:

| Today (app) | Website wording | Action |
|---|---|---|
| "Portfolio · Fund" | **Fund OS** / "Fund administration" | rename section |
| "Valuations (409A)" | **409A** ("Model dilution across rounds" family) | keep 409A, drop parenthetical |
| "Find Investors / Discover" | **Find Investors** / **Discover** (same) | already aligned ✓ |
| "Raise pipeline" | **Raise Pipeline** | title-case |
| "Data room" | **Data Room** — "Section checklist · share & track" | adopt subtitle |
| "LP" section | **Investor Room** | rename |
| "Fund" section | **Fund OS** | rename |

## 5. Implementation phases

**Phase 0 — foundations (no visible change)**
- Extract the site's `SUITES` / `SOLUTIONS` arrays into a shared
  `lib/nav/taxonomy.ts` consumed by *both* `components/landing/navigation.tsx`
  and the new app shell, so the two never drift.
- Add `dashboardHref` to each item alongside the existing marketing `href`.

**Phase 1 — new app shell behind a flag**
- Build `components/shell/app-nav.tsx` (top bar + Products mega-menu), persona-aware,
  reusing `DashboardTopbar`'s right cluster.
- New `app/dashboard/layout.tsx` variant that renders `AppNav` instead of
  `DashboardSidebar`. Gate with an env/localStorage flag (`anker:nav=top`) so we
  can dogfood without shipping.

**Phase 2 — page chrome parity**
- Standardize `PageShell` + `PageHeader` to the site's section-header styling
  (serif title, mono eyebrow, red bullet). Roll across existing module pages.

**Phase 3 — command palette + search**
- Register every destination with site-wording labels; make ⌘K the spine.

**Phase 4 — cut over + delete**
- Flip the flag on for all users; remove `DashboardSidebar` and the collapse logic.
- Keep a slim left rail **only** if a module needs sub-nav (e.g. Fund OS's many
  sub-pages) — as a contextual secondary nav, not a global one.

**Phase 5 — polish**
- Motion, empty states, mobile (top bar collapses to a sheet, like the site's
  hamburger).

## 6. What stays as-is

- All routes and server components — this is a **shell** change, not a rewrite.
- `DashboardTopbar` right cluster (⌘K, theme, Tasks, Downloads, user).
- Persona resolution (`resolveActiveMembership`, `isOwner`) — it already feeds nav.
- Admin console (owner-gated) — reachable from the user menu, not the primary nav.

## 7. Open questions

1. **Mobile:** top-bar sheet vs. keep a bottom tab bar for the 3 primary entries?
2. **Multi-persona owners** (who see all suites): show all three suite columns, or
   a persona switcher that swaps the menu? (Lean: persona switcher in the brand
   lockup, matching the existing entity switcher.)
3. **Density:** power VC users have ~25 destinations — is a single Products menu
   enough, or do Fund OS power tools deserve a persistent contextual left rail
   (Phase 4)?
4. Do we surface **Solutions** (Founders/VCs/LPs) in-app at all, or is that a
   marketing-only concept once you're already logged into a persona?

## 8. First concrete step

Phase 0 + a throwaway Phase 1 spike: extract `lib/nav/taxonomy.ts`, build
`AppNav` behind the `anker:nav=top` flag, and dogfood the founder persona on the
dashboard. Everything else follows from how that feels.
