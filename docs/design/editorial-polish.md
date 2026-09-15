# Anker editorial polish — September 9, 2026

## Design comparison

Reviewed the current McKinsey homepage, newsroom, company overview, Tech & AI capability page, and an article. The homepage and newsroom were also inspected in the browser. This is a representative crawl, not an exhaustive inventory of McKinsey's site. Production `an-ker.de` still shows the earlier website; the work reviewed here lives on `feat/anker-editorial-website`.

| Reference | Observed pattern | Anker implementation |
| --- | --- | --- |
| [Homepage](https://www.mckinsey.com/) | Deep-blue framing, generous spacing, image-led editorial hierarchy, distinct content categories | Deep-blue dark mode with a restrained silver/light counterpart. A concise introduction explains investor research, fundraising, and fund operations. Existing audience routes and product tabs remain the primary paths. |
| [Newsroom](https://www.mckinsey.com/about-us/new-at-mckinsey-blog) | Large serif masthead, short description, three featured stories with category and date | Consistent Georgia masthead and archive headlines; existing feature grid and filters preserved. Archive, search, selects, pagination, and empty states inherit the selected palette. |
| [Company overview](https://www.mckinsey.com/about-us/overview) | Purpose, people, ways of working, and onward exploration grouped clearly | Retain Anker's company, vision, team, and careers structure. Do not borrow client results or invent people to fill the layout. |
| [Tech & AI capability page](https://www.mckinsey.com/capabilities/tech-and-ai/how-we-help-clients) | Clear proposition followed by approach, capabilities, examples, and further reading | Product and audience pages retain their workflow detail. Copy now distinguishes assistance, review, and recorded activity from unsupported guarantees. |
| [Article](https://www.mckinsey.com/capabilities/tech-and-ai/our-insights/the-new-management-playbook-for-ai-how-to-move-faster-and-create-more-value) | Publication context, title, date, authors, introduction, reading column | Existing article layout extended across both themes: metadata, body links, citations, sidebar, PDF links, and related stories. |

This is an interpretation of the reference's hierarchy and visual restraint. Anker retains its own brand, original imagery, copy, and product architecture. McKinsey's proprietary fonts and assets are not shipped. The theme switch is an Anker feature; this review does not claim McKinsey offers the same preference control.

## Theme and imagery

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#ffffff` | `#051c2c` |
| Alternate surface | `#f2f5f7` | `#0b283c` |
| Primary text | `#102433` | `#f4f7fa` |
| Secondary text | `#4c5f6c` | `#b8cad7` |
| Links / focus | `#12618f` | `#8dceff` |
| Logo | Silver frame and wordmark | Existing red medallion with silver frame and wordmark |

The blue values are Anker's chosen implementation, not a claim of an exact extracted McKinsey palette. Themes are scoped to public editorial surfaces, with the consent UI carrying the same branding. Authenticated dashboard palettes are unchanged. The shared existing `next-themes` preference persists across navigation and reloads; without an explicit choice it follows the system. The switch announces the destination theme and waits for mounting before becoming interactive.

The supplied dark and light logo assets under `docs/brand-logos` were inspected and match the existing SVG component's brand variants. The header and footer now use its theme-aware default variant. Gradient identifiers remain unique per instance.

The three original WebP compositions were visually inspected. No replacement generation was needed. Tall hero crops now preserve the light opening in **Convergence**, the horizon in **Perspective**, and the structural rhythm in **Building**; mobile crops return to the full composition. Source colors are preserved without dark-mode filters. News covers retain their existing missing-image handling. These images depict fictional architecture, not Anker premises or portfolio companies.

## Repository evidence and copy corrections

The README, whitepaper inventory, platform audit, navigation taxonomy, and MCP documentation informed the review. Historical audit metrics were not treated as live platform counts. Specific claims were checked against implementation:

| Evidence | Copy consequence |
| --- | --- |
| `lib/ai/semantic-search.ts`, `lib/matching/lp-matchmaking.ts`, `lib/matching/` | Describe investor research and contextual fit. Remove hard-coded 60k+ coverage totals and the unsupported universal shortest-introduction-path claim. A match is a research input, not a commitment to invest. |
| `lib/outreach/engine.ts`, `lib/outreach/deliverability.ts`, `lib/outreach/send-gate.ts`, `app/api/outreach/draft-email/route.ts` | Emphasize draft review and explicit sending. Replace warmup/domain-check promises with sending limits and suppression handling found in the code. |
| `app/api/outreach/analytics/route.ts` | Describe recorded engagement and expressions of interest. The analytics implementation counts an interested reply as a meeting proxy; do not promise actual booked-meeting attribution. |
| `app/api/portfolio/funds/[id]/deals/[dealId]/close/route.ts` | Explain that the close workflow creates a linked investment record; avoid implying that moving any card silently closes an investment. |
| `lib/portfolio/fund-ledger.ts`, `lib/portfolio/lp-portal.ts` | Frame performance around recorded cash flows, valuations, and published reports. Remove always-current and universal reconciliation guarantees. |
| `lib/auth/local.ts`, `lib/auth/require-admin.ts`, `lib/audit/audit-log.ts`, `lib/portfolio/lp-portal.ts`, `lib/db/secrets.ts` | Security page describes account controls, recorded activity, scoped portal access, and publication states. Remove unsupported operational claims about encryption everywhere, review cadence, log retention, backups, response SLAs, and legal assurances. Deployment-specific arrangements require review with Anker. In particular, secret encryption depends on `SECRET_KEY`; source support alone does not establish production configuration. |

Unused anonymous testimonial strings and obsolete accent configuration were removed from all eight product/audience content objects and their shared type. This prevents the unsupported quotes returning in a later presentation change. No database, authentication, sending, or fund-operations logic is changed.

Existing careers openings and benefit terms, legal policies, and historical changelog entries still need the owner's operational confirmation before a production release; source code cannot establish their currency. This is a marketing UI/content review, not a security certification or a legal-policy audit.

## Verification

- 21 tests passed across seven Vitest files: public navigation, forms, newsroom, articles, theme preference persistence, system-default behavior, and palette contrast.
- Contrast tests use the actual light/dark CSS values: normal text and primary button pairs at least 4.5:1; focus indicators at least 3:1 against tested surfaces. This is token-level verification, not a full accessibility certification.
- TypeScript validation passed. Production compilation and prerendering passed for 174 static pages using the temporary offline font fixture described below.
- Local browser QA could not run: the supervised preview forwards Vite flags that this existing Next.js application does not accept. The project architecture and development script were preserved. Responsive visual appearance, live font rendering, and browser interactions on the branch remain unverified.
- Google font downloads are blocked in this environment. Compilation uses Next's temporary offline font fixture; that fixture is neither committed nor deployed. No production deployment or merge is part of this push.
