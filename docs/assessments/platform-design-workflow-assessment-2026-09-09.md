# Anker platform: design, organization and workflow assessment

Assessment of branch `feat/anker-editorial-website`, application baseline `5214a99760c50d3cc80c176a745b7c4db3d818b1`.

## Judgment

Anker has the visual foundations of an institutional venture platform, but its organization and working experience are only partially aligned with the intended McKinsey-inspired direction. The blue palette and editorial headings are already present. The larger opportunity is a coherent operating experience: a clear mandate, a small number of work areas, consistent records, visible next actions, dependable saves and explainable metrics.

The current implementation exposes a broad feature inventory. A founder, fund operator or LP should instead encounter an environment organized around their responsibilities. Preserve the underlying capabilities, but progressively disclose specialist tools inside the workflow where they become useful.

This is a code-led heuristic assessment and public-reference review, not a usability study or a visual certification. I reviewed the shared shell, navigation taxonomy, home, discovery, CRM, outreach, raise pipeline, fund navigation and deal workroom, and LP overview/activity. There are 151 dashboard `page.tsx` files; this report does not claim individual inspection of every page. Authenticated production screens, browser screenshots, assistive technology behavior and real customer task completion were not exercised in this assessment. Private McKinsey product environments were not accessed.

## Reference standard

McKinsey's public website separates content and capability areas with clear headings and purpose-led descriptions. This is a useful editorial reference, but operational software also needs dense, efficient controls. [McKinsey website](https://www.mckinsey.com/)

Wave's public product description emphasizes initiative progression, ownership, milestones, approval workflows and tracking outcomes. Its comparison page also describes metric reconciliation. These are useful workflow benchmarks for Anker's deal, fund and investor processes; they are vendor descriptions, not independently verified product claims. [Wave overview](https://www.mckinsey.com/capabilities/transformation/how-we-help-clients/wave/overview), [Wave's approach](https://www.mckinsey.com/capabilities/transformation/how-we-help-clients/wave/our-advantage)

Spendscape describes a progression from reliable data through curated analytical journeys to action and impact tracking. Performance Lens focuses on executive decisions supported by benchmarks. My recommendation for Anker is to adopt that relationship between evidence, decisions and follow-through. [Spendscape offerings](https://www.mckinsey.com/solutions/spend-analytics-software/our-offerings), [Performance Lens](https://www.mckinsey.com/industries/financial-services/how-we-help-clients/performance-lens/overview)

The typography, spacing, navigation and component specifications below are proposed Anker design decisions. They are not claimed to be McKinsey's private design system.

## Current alignment

| Dimension | Assessment | Evidence and implication |
| --- | --- | --- |
| Brand foundations | Directionally aligned | `app/platform.css` already defines white/silver surfaces, deep-blue dark mode, serif h1 headings, subdued borders and semantic status colors. Keep this foundation. |
| Visual consistency | Partial | Shared headings and panels coexist with local layout rules, large rounded containers and hard-coded accents. Global h1 rules already override some local display-font classes, so class names alone do not prove a rendered typography mismatch. |
| Information architecture | Needs substantial work | The customer navigation exposes 31 founder destinations or 36 VC destinations before shell/account additions. Specialist tools and channels compete with core jobs. |
| Role clarity | Partial | Workspace persona filtering and separate LP access exist, but the LP dashboard menu includes a GP-only destination and extensive prospecting tools. |
| Workflow continuity | Uneven | The deal workroom has stage gates, scorecards, votes, documents and close actions. Founder fundraising is less dependable and uses a browser-local raise target. |
| Decision support | Partial | Home displays recent deals and counts, while the outreach header contains nine KPIs. Priorities, exceptions and the next responsible action need stronger hierarchy. |
| Trust in displayed state | Needs immediate fixes | Certain failed saves remain visible as successful edits; initial loading failures can become empty datasets; currency presentation can imply an unsupported denomination. |

## What should be retained

- The canonical navigation taxonomy and server-side workspace/fund guards. Consolidate presentation around them.
- Existing platform tokens, keyboard focus styles, skip links, mobile sheet primitives and reduced-motion rules. These are useful foundations, although they do not constitute complete accessibility validation.
- CRM saved views, contact detail, tasks and activity context. Contact detail already carries the contact ID into outreach, which is a useful handoff to preserve.
- The fund deal workroom's stage gates, IC votes, terms, documents and close workflow. Use this as the strongest internal example of an integrated workflow.
- LP-specific access and document delivery, estimated-NAV explanatory copy and capital-call acknowledgement. Some comments describe the LP area as read-only, but the activity component does implement acknowledgement; this assessment follows the implementation.

## Findings to resolve before or alongside the visual redesign

Priority 1 means the issue can mislead a user, interrupt a core task or undermine scope clarity. Priority 2 means a significant design or navigation improvement. These are product priorities, not security severity ratings.

| ID | Priority | Source-confirmed finding | Required change and completion criterion |
| --- | --- | --- | --- |
| A01 | 1 | `RaisePipelineClient.patch` updates local state, ignores HTTP status, and keeps the optimistic change after a network failure. | Check the response, show saving/saved/failed state, and restore or explicitly mark an unsaved value. A failed request must never leave a confirmed-looking stage or check size. Test both HTTP and network failures. |
| A02 | 1 | Raise target uses the single localStorage key `anker:raise-target`; the page reads the user's CRM entries across boards. | Model a raise/round with workspace, currency, target and selected pipeline membership. Show the active round and personal/shared scope. Two rounds and two workspaces must retain independent targets across devices. This is a domain change, not just a layout edit. |
| A03 | 1 | Home formats an absent currency as USD despite scope copy saying no symbol is shown. Raise pipeline, deal detail and LP overview have hard-coded dollar formatters. LP overview sums memberships without currency grouping/conversion in its page loader. | Centralize money formatting; use recorded currency or a clear unknown-currency state. Group unlike currencies unless an explicit reporting-currency conversion with date/rate exists. Always show reporting date and scope where relevant. Do not infer that existing customer data actually contains mixed currencies without checking it. |
| A04 | 1 | LP navigation exposes `/dashboard/portfolio/fund/performance`, but that area's layout requires VC persona and redirects LPs to `/lp`. | Route LP performance to an authorized LP view or remove the unavailable link. Exercise every role-visible destination with its matching role. |
| A05 | 1 | The fund More menu includes `/dashboard/portfolio/fund/lps`; the repository has a nested statement page but no index page at that destination. | Point the link to the canonical LP/partner directory or implement the missing index. Verify route resolution in the deployed app. |
| A06 | 1 | CRM initial queries catch failures and return empty arrays. Outreach initial campaign queries suppress failures. Discovery helpers also convert query errors to empty results/counts. | Preserve load status separately from data. Distinguish genuinely empty, filtered-empty, unavailable and partial results. Recovery should preserve the user's context and provide a retry. Existing route error boundaries cannot catch exceptions already swallowed here. |
| A07 | 2 | Both shell modes remain selectable via cookie/localStorage/URL. The sidebar adds AI Assistant and ANKER AI in Overview, then repeats those destinations from the canonical AI group. The alternative top shell also has a full persistent rail. | Adopt one customer shell and deduplicate navigation. Give operational assistance one clear entry point; if general multi-model chat remains distinct, explain that distinction inside the assistant area. Keep owners' preview controls separate from customer workspace selection. |
| A08 | 2 | The canonical taxonomy has 31 founder, 36 VC and 14 LP items. Of those, 18, 20 and 6 carry AI/New/Agent badges respectively. Eight LP items belong to LinkedOut. | Reduce first-level navigation to responsibility-based areas. Place channel tools within Outreach, specialist tools within their domain and optional prospecting behind a purposeful workspace configuration. Remove persistent novelty badges. |
| A09 | 2 | Fund navigation adds eight tabs and twelve More links to the global menu. Labels vary across surfaces: CRM/Relationships/Relations, Partners/LPs, and Quick Start's “Initiate payment” opens a distribution flow. | Define a naming glossary and one location per task. Use “Create distribution” for that specific action. Split context navigation by work area instead of showing the entire fund catalog everywhere. |
| A10 | 2 | Home has generic pipeline copy and four standard metrics; quick actions vary by persona. Outreach's header contains nine KPI instances beside controls such as “Sync Resend” and “Studio.” | Build role-specific operating home pages and a consistent page hierarchy. Show a few decision-relevant measures first, with detailed channel telemetry under Analytics. Rename provider-facing operations in task language, retaining technical detail only where users need it. |
| A11 | 2 | Default sidebar and LP header use the logo's default variant, which renders a red medallion in dark mode; auth now uses silver. ReadyForCall retains a hard-coded red accent. | Apply an intentional silver/deep-blue brand policy across shells; reserve red for meaningful urgency/error. Standardize component tokens rather than globally removing useful semantic colors. |
| A12 | 2 | LP overview renders a nested main landmark and starts at h2; several LP filters and raise-row controls lack explicit labels. The raise funnel places fixed-width labels/counts beside a flexible bar. | Give each screen one main landmark and a page title; label row controls with their record identity. Verify the funnel at narrow widths, keyboard operation, focus return, touch targets, contrast and zoom in a real browser. Source suggests a narrow-layout risk; overflow has not been measured here. |
| A13 | 1 | Raise pipeline labels the sum of check sizes at Responded, Meeting and Diligence stages as “Soft-circled.” There is no separate expression-of-interest field in this calculation. | Distinguish estimated pipeline checks from explicitly indicated interest and committed capital. An email response or meeting must not automatically imply soft-circled capital. Include the metric definition beside its drill-down. |

Navigation counts were computed from `groupsForPersona`, excluding sidebar Overview, account, owner-console and command-palette extras. They are code inventory counts, not observed user click counts.

## Proposed organization

Use one persistent context header showing the active workspace/entity, a compact desktop side navigation, local tabs inside the selected work area and a shared search/action launcher. Mobile should prioritize role-specific daily tasks and progressively reveal the rest.

| Role | Primary areas | What moves into context |
| --- | --- | --- |
| Founder | Overview; Fundraising; Relationships; Outreach; Company; Documents | Matching and discovery inside Fundraising; LinkedOut inside Outreach; cap table, runway and equity tools inside Company; data rooms/decks inside Documents. |
| Fund manager | Overview; Deals; Portfolio; Investors; Fund operations; Reporting | Deal discovery, diligence and IC within Deals; LP fundraising/communications in Investors; calls, distributions, entities and compliance within Fund operations; analytical tools within the task they support. |
| LP | Overview; Capital activity; Documents | Performance detail inside Overview; call and distribution notices inside Capital activity. Enable additional investment/prospecting capabilities only for an explicit LP job or separate workspace mode. |

Keep Search, Tasks, Anker Assistant, Help and Settings as consistent utilities. Site marketing suites can share route identifiers with the app without dictating the app's everyday navigation groups. Shared data definitions are valuable; identical marketing and operational menu structures are not a requirement.

Use distinct domain objects: contact, organization, fundraising round, investment opportunity, fund, LP commitment, campaign and document. A founder's committed investment interest and a fund's closed portfolio investment require distinct state definitions. Reuse record patterns and relationships without forcing them into one generic pipeline.

## Workflow assessment and desired continuity

| Journey | Existing useful implementation | Redesign focus | Acceptance scenario |
| --- | --- | --- | --- |
| Founder raise | Investor discovery, matching, CRM, a raise stage view, contact-to-outreach link and campaign tools | Select round → build target list → qualify → contact → review replies → diligence → record commitment. Preserve round, contact, selected view and next action across transitions. | A founder returns from a draft to the same contact and filtered list; a failed stage save is explicit; target and currency survive a second device. |
| Fund investment | Fund-scoped deal workroom, scorecard, IC votes, terms, stage gates and closing | Source → screen → diligence → IC → terms → close → portfolio. Make evidence, blocker, owner and next gate visible at every stage. | A partner can identify why a deal cannot advance, open the missing evidence and return without losing context. Closing lands on the resulting investment. |
| Fund operations | Capital calls, distributions, documents, fund performance and reporting | Select fund/period → prepare → review/approve → issue/publish → reconcile → track exceptions. Verify backend support for each transition before exposing new actions. | An operator can distinguish draft, approved, issued and reconciled records and identify the owner of an overdue item. |
| LP review | Membership-scoped overview, documents and activity acknowledgements | Review fund/period → inspect notice → acknowledge → retrieve supporting document. Keep fund, reporting date and currency visible. | An LP sees only authorized funds, reaches every visible page and distinguishes estimated values from reported statements. |

## Visual design specification for the first implementation

- Retain the current deep-blue dark canvas and silver identity. Use white/light-grey working surfaces in light mode, a restrained blue action color and semantic status colors with text labels.
- Use editorial serif type for page titles and a consistent sans serif for controls, records and data. Retain tabular numerals. Establish shared title, subtitle, section-heading and metadata styles.
- Define four page templates: operating overview, record list, record detail/workroom and creation/review flow. Standardize context, page title, primary action, key measures, work content and supporting evidence in that order.
- Use compact density for work tables and more space around summaries and decisions. Replace arbitrary mixtures of panel radii and decorative containers with a small component scale.
- Give tables common filtering, saved views, sorting, selection, bulk action, column and record-detail behavior. Preserve views in the URL or durable saved-view state where appropriate.
- Every asynchronous action needs a visible pending state and an honest outcome. Long jobs need progress, delivery/result status and a way to resume or retry where supported.
- AI should act within the current record and workspace, show sources/assumptions, and distinguish generated drafts from recorded facts. Review gates should be explicit for consequential actions.
- Use charts, company marks, document previews and evidence imagery in the platform. Keep decorative editorial photography for orientation and narrative moments so it does not displace operational information.

## Delivery order

| Slice | Scope | Release gate |
| --- | --- | --- |
| 1. Trust and shell | A01–A06 and A13 correctness issues; one navigation shell; role-correct destinations; context header; silver branding; naming glossary | Failed saves recover honestly; currencies/scopes and pipeline metric definitions are explicit; all role-visible routes resolve; no duplicate AI entries; preserve authorization boundaries. |
| 2. Operating overview | Founder, GP and LP home templates; priorities, upcoming deadlines, approvals and drill-down metrics | A pilot user can identify their active mandate and next task without searching through the tool catalog. Validate with observed tasks. |
| 3. Founder journey | Round context, discovery-to-CRM handoff, raise pipeline and outreach | Complete one end-to-end raise scenario with preserved context, persisted round data and recoverable failures. |
| 4. Fund journey | Deals/IC, portfolio, LP operations and reporting | Complete representative investment and capital/reporting workflows with existing gates and explicit ownership. |
| 5. LP and specialist areas | Investor portal, remaining financial/equity tools and administrative exceptions | Role-specific browser QA, keyboard/zoom/mobile review, long-label and empty/failed/partial-data cases. |

Each slice should be reviewed in light and dark mode at narrow mobile, tablet and desktop widths, with realistic data volumes and different memberships. Establish a baseline with pilot users before setting numerical improvement claims: task completion, time to find a priority, navigation detours, failed-save recovery, and successful return to interrupted work. The old automated test pass is useful engineering context, not evidence of usability.

Start with slice 1 and one complete operating overview. This creates the design and workflow contract for subsequent pages and prevents a large restyling effort from preserving the current organizational problems.

## Repository evidence index

- [Platform tokens](../../app/platform.css), [shared header](../../components/shell/page-header.tsx), [home presentation](../../components/tesseract/dashboard-content.tsx), [home data](../../lib/platform/home-data.ts)
- [Canonical taxonomy](../../lib/nav/taxonomy.ts), [sidebar](../../components/tesseract/dashboard-sidebar.tsx), [shell selection](../../components/shell/nav-mode-shell.tsx), [context rail](../../components/shell/app-subnav.tsx), [mobile navigation](../../components/shell/app-mobile-nav.tsx), [quick actions](../../components/shell/quick-start.tsx)
- [Workspace switcher](../../components/shell/entity-switcher.tsx), [persona guard](../../lib/auth/persona-guard.ts), [fund layout](../../app/dashboard/portfolio/fund/layout.tsx), [fund tabs](../../components/portfolio/fund-tabs.tsx)
- [Raise pipeline](../../components/fundraising/raise-pipeline-client.tsx), [CRM update API](../../app/api/crm/entries/[id]/route.ts), [CRM loader](../../app/dashboard/crm/page.tsx), [discovery loader](../../app/dashboard/discover/page.tsx), [outreach loader](../../app/dashboard/outreach/page.tsx)
- [CRM work surface](../../components/crm/crm-powerhouse.tsx), [contact handoff](../../components/crm/contact-detail.tsx), [outreach work surface](../../components/outreach/outreach-powerhouse.tsx)
- [Deal workroom](../../components/portfolio/deal-detail-client.tsx), [deal gates](../../lib/portfolio/deal-stage-gates.ts), [LP layout](../../app/lp/layout.tsx), [LP aggregates](../../app/lp/page.tsx), [LP overview](../../components/lp/lp-dashboard-client.tsx), [LP activity](../../components/lp/lp-activity-client.tsx)
