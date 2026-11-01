# 78. Spec: the first-run show and a Help tab that knows the product

Status: **spec. Nothing is built.** Raised by the founder on 2026-11-01: a guided "show" for people who have just signed up, and a Help tab filled with real knowledge about the app. Builds on the setup wizard (`components/onboarding`, `app/api/onboarding`, `lib/org/provision.ts`), the dashboard shell (`components/shell`), the route catalogue (`lib/nav/taxonomy.ts`, `lib/nav/work-areas.ts`), entitlements (`lib/entitlements/routes.ts`), the assistant (docs 43 and 44) and the legal and privacy posture of docs 54 and 73.

## 0. Reading guide
Section 1 is what exists, measured. Sections 2 and 3 are the product: the principles and the first-run experience. Section 4 is the Help knowledge base. Sections 5 to 8 are how it is built, stored, measured and tested. Section 9 is the build order, and section 10 the decisions that are the founder's.

## 1. What exists today (read from the repository, 2026-11-01)
- **Setup is a wizard, not an introduction.** Sign-up lands on `/onboarding` (`PersonaChooser`: founder or venture fund), then a three-step founder or fund wizard that saves a draft (`onboarding_drafts`) and, at the end, creates the workspace (`completeOnboarding`). After that the person arrives on `/dashboard` with **no explanation of what they are looking at**. The dashboard has a "Quick start" row of four links and a "Needs attention" row; neither explains anything, and neither remembers that the person is new.
- **The Help tab is a 216-line static component** (`components/tesseract/help-content.tsx`). It shows four topic cards, each with three **titles that lead nowhere** (no article exists behind any of them), four FAQ answers, and three quick-action cards of which **two ("Email Support", "Book a Demo") are buttons with no handler** and the third sends the person to the sales contact form. It was written for an earlier product: it names a "Pro" plan and a "Settings > Billing" page, says matching uses "9 key factors", and promises CSV export "from the Analytics page". **None of those claims is checked against the code**, and some are probably untrue today. A Help page that is wrong is worse than none.
- **The product is large.** 59 dashboard areas. By role (from `WORK_AREAS`): founders have six work areas (fundraising, relationships, outreach, company, documents, assistant), funds have six (deals, portfolio, investors, fund operations, reporting, assistant), and LPs have three. Features appear and disappear by plan and by platform switch (entitlements, flags), so a fixed tour would describe things a workspace cannot use.
- **Useful parts to reuse:** `EmptyState`, `PageHeader`, the command palette, `featureForPath()` (which route needs which feature), the `/faq` and `/fundraising-guide` marketing pages (public, separate), the changelog page, the staff badge (who is a platform operator), the local sandbox with demo accounts (docs 75).

## 2. Principles
1. **Show, then get out of the way.** The tour is short (about two minutes), skippable at every step, never blocks work, and never repeats on its own. Replaying it is one click, forever.
2. **Progress comes from the data, not from clicks.** "Upload your deck" is done when a deck exists, not when a button was pressed. A person who did it themselves is not told to do it again.
3. **Everything it says is true.** Every claim in the tour and in an article is checked by a test against the code: routes exist, features exist, numbers come from constants. A page of Help that cannot be checked is not shipped. (This is the lesson of section 1.)
4. **It follows the person's reality.** Role (founder, fund, LP, invited member, viewer), plan and platform switches decide what is shown. A feature that is off for this workspace is not toured; it is not mentioned except in one honest line ("Not on your plan").
5. **Plain words.** The writing style of the product: short sentences, no jargon, no hype, no promises about outcomes. What the assistant can do and what it only suggests are said as they are: it suggests, a person approves.
6. **Private by construction.** What is measured is counts, never content, and never tied to a person's identity beyond what the workspace already holds (section 7).
7. **Accessible and calm.** Keyboard, screen reader, reduced motion, dark mode, phone width. No auto-playing video. No dark patterns: no countdowns, no guilt, no "you are 20% done" pressure.

## 3. The first-run experience (the "show")
It has five parts. Each is useful alone; together they are the show.

### 3.1 Welcome (the moment after setup)
On the first `/dashboard` load after setup completes, a **welcome card** (not a full-screen modal) sits above the content: "Welcome, {first name}. Anker is set up for {workspace}. Take the two-minute tour, or start with the checklist." Buttons: **Take the tour** (primary), **Not now**, **Skip for good**. It waits for the cookie banner to be answered first (the banner would otherwise cover it). Closing it does not mark anything done; "Not now" brings it back once on the next sign-in, "Skip for good" never.

### 3.2 The guided tour
A short sequence of **coachmarks** anchored to real parts of the screen, each with one idea, **Next / Back / Skip tour**, a step counter, and arrow-key and Esc support. A step can send the person to another page (for example the assistant) and continues there. If a target is missing on this screen, or the feature is not available to this workspace, **the step is skipped silently**, never a broken pointer.

| # | Founder (about 7 steps) | Fund (about 7 steps) | LP (about 4 steps) |
| --- | --- | --- | --- |
| 1 | Your workspace and role: the switcher, and that a person can have several | the same | the same, "your fund's portal" |
| 2 | The areas of the app in the left menu, in your own words ("Fundraising, Relationships, Outreach, Company, Documents, Assistant") | ("Deals, Portfolio, Investors, Fund operations, Reporting, Assistant") | ("Capital activity, Documents, Assistant") |
| 3 | **Find investors**: what a match is, what the score is made of, and that it is a starting list, not a verdict | **Investors and matchmaking**: LPs that fit the fund | **Your capital account** and statements |
| 4 | **Your pipeline (CRM)**: where a saved investor goes, stages, tasks | **Deals**: the pipeline and the deal room | **Documents** you have been given |
| 5 | **Outreach**: drafts first; nothing is sent until you approve; the sender limits | **Fund operations**: capital calls, distributions, compliance, as far as the plan includes them | **Calls and notices** |
| 6 | **The assistant and the actions inbox**: it reads, it proposes, **you approve**; the one idea that makes the rest safe | the same | the same, read-only |
| 7 | **Help, the command palette (Ctrl or Cmd K) and replaying this tour** | the same | the same |

Copy is plain and specific; each step ends with one verb ("Open Find investors"). The tour never asks for data and never makes a change: it **only points**. The assistant step offers one **sample question** to try, which the person must send themselves.

### 3.3 The getting-started checklist
A persistent card on the dashboard (collapsible, dismissible, never in the way of the work). Items are **derived from real data** and each has why, rough time, a link, and **Skip this** (remembered). Proposed items, to be settled against the code in O1:
- **Founder:** your company profile (done by setup), upload your deck and read its review, run a first investor match, save five investors to your pipeline, draft a first outreach message (a draft counts, sending is not required), connect a mailbox, invite a teammate.
- **Fund:** your fund profile (done by setup), set the fund's details and currency, add your first deal, add LPs or import them, invite a colleague, open the investor requests inbox.
- **LP:** confirm your details, open your capital account, read your latest statement.
- **Invited member** (joined an existing workspace): no setup items; a short "how this workspace is organised" tour and the items the workspace's owner marked for new members (later).
When every item is done or skipped the card thanks the person once and disappears; it can be reopened from Help.

### 3.4 Empty states that teach
Where a page has no data yet (an empty pipeline, no calls, no deals), the existing `EmptyState` gets one line of explanation, the one action that fills it, and a **"How this works" link to the matching article** (section 4). These are the places a newcomer actually gets stuck, so they carry the teaching, not the tour.

### 3.5 Replay and recall
Help has "Take the tour again" and "Open the checklist". The command palette has "Show me around". Replaying starts at step 1 and changes no history. A new product version that adds a step offers **"What's new in the tour"** (only the new steps) once.

## 4. The Help tab as a knowledge base
### 4.1 Content is files, checked by tests
Articles are Markdown in `content/help/{persona}/{slug}.md` with front matter:
`title`, `summary` (one sentence), `personas` (founder, vc, lp, member), `area` (the work area), `routes` (the in-app routes it explains), `feature` (the entitlement key it needs, if any), `flag` (a platform switch it depends on, if any), `updated` (date it was last checked against the code), `related`, `keywords` (including German terms and common wrong words, so a search for "dataroom" or "Datenraum" finds "Data room"). Body shape: **What it is, When to use it, Steps, What it does not do, Limits, If something goes wrong.** At most about 900 words; one idea per article.
**Numbers and names come from the code, not from the author:** tokens like `{{limit:outreach_sends_day}}` or `{{const:MAX_TRANSCRIPT}}` are resolved at build time from a short allow-list of constants and entitlement defaults, so an article cannot drift when a limit changes.

### 4.2 The accuracy guard (the part that matters most)
`lib/help/help.test.ts` fails the build when:
- an article's `routes` are not real pages in `app/` or are not in the route catalogue;
- `feature` is not a known entitlement key, or `flag` is not a known platform flag;
- a `{{token}}` is not on the allow-list;
- the text contains a banned phrase: prices, plan names that the plan catalogue does not have, "unlimited", "guaranteed", "instantly", "always", and the claims found stale in section 1;
- an article links to another article or route that does not exist, or is missing a required section;
- **coverage:** a route in `WORK_AREAS` for any role has no article and is not on an explicit "no article yet" list in the repository. The list is a visible debt register, not an escape hatch: it can only shrink in review.
A stale `updated` date (older than six months) is reported in the build log, not failed.

### 4.3 What the person sees
- **Help home** (`/dashboard/help`): a search box; **"For your role"** (a shortlist of five articles by persona and by what the checklist says is still open); "Start here" (a three-article path); topics by work area; **Replay the tour**; keyboard shortcuts; a short glossary (match score, stage, data room, actions inbox, workspace, persona); "What's new" (from the changelog); and a **real way to reach a person** (one contact address, decision 6). The dead buttons go.
- **Search:** client-side over a generated index (title, summary, keywords, headings, body), accent-folding, simple English and German stemming and a small synonym list, ranking by field weight. No external service, no query leaves the browser (section 7). Zero-result queries are counted anonymously so the gaps are visible.
- **Article page** (`/dashboard/help/{slug}`): the article, a table of contents, **"Open this in Anker"** buttons (deep links with `routes`), related articles, **"Was this helpful?"** (a count, no free text), and "Last checked {date}".
- **Contextual help:** a **"?" in `PageHeader`** opens a side drawer with the article whose `routes` match the current page: summary, the three most important steps, and a link to the full article. A page with no article shows nothing (no empty drawer). Because the mapping is the article's own `routes`, a new page gets help by adding one file.
- **Ask about the app** (later slice, O6): the assistant gets one **read-only tool**, `help_search`, that returns article excerpts and links. It must answer from them and cite the article; if none applies it says so and offers the support contact. It cannot change anything. It reuses the assistant's existing observe tier and its prompt-injection rules (article text is data, not instructions).

### 4.4 Content inventory (launch set, about 30 articles, drafted from the code and reviewed by the founder)
- **Everyone:** Welcome to Anker (what it is, in one page); Workspaces, roles and switching; The assistant: what it reads, what it proposes, what you approve; The actions inbox; Command palette and shortcuts; Privacy in plain words (what Anker stores, who can see it); Billing and your plan (only what the plan catalogue states); Glossary.
- **Founders:** Set up your company profile; Upload a deck and read the review; Find investors: how matching works and what the score means; Save to your pipeline; Outreach: drafts, approval, limits and deliverability; LinkedIn outreach (assisted sending); Calls and Halyard; Data room; Cap table and runway; Investor updates; Connect your mailbox.
- **Funds:** Set up your fund; Deals and the deal room; Investors and LP matchmaking; Investor requests (the inbox for investors who ask to talk); Capital calls and distributions; KYC and compliance (as far as the plan includes); Reporting and the tear sheet; Intake forms; The investor passport and listing (only while those switches are on).
- **LPs:** Your capital account; Statements and documents; Calls and notices; Asking the assistant about your holdings.
- **Troubleshooting:** I cannot see a page; A match looks wrong; An email did not send; The microphone does not work in Halyard; I was signed out.
Written to the product's own tone; every article names what the feature **cannot** do.

## 5. How it is built
### 5.1 The tour engine
A small engine of our own (about 400 lines, no third-party tour library, so no new dependency, no licence question and full control of accessibility): `components/onboarding-tour/`. Targets are `data-tour="id"` attributes on real elements; a **registry** (`lib/onboarding/targets.ts`) lists every id and the route it lives on, and a test fails if a step names an id no component carries. Positioning with the browser's anchor geometry and a fallback to a **centred card** when the target is off screen; on phones a **bottom sheet**. Focus moves into the coachmark and back; `aria-live` announces the step; Esc skips; arrow keys move; `prefers-reduced-motion` removes movement; the tour **pauses itself** when a dialog opens or the person starts typing in a field. It mounts once in the dashboard layout, behind the flag, and does nothing for staff impersonating a customer (the staff badge) or for read-only sessions: **no state is written for them**.
### 5.2 Definitions are code, copy is a file
`lib/onboarding/tours.ts` holds the steps as data (id, target, route, feature, role filter, copy key); `lib/onboarding/copy.en.ts` holds the words, so a German file can sit beside it (decision 1). Each tour has a `version`. The step list for a person is computed on the server from persona, entitlements (`featureForPath`) and flags, so the client never sees a step it may not use.
### 5.3 The checklist
`lib/onboarding/checklist.ts`: one function per item that returns done, skipped or open from a small indexed query (a deck exists, a match run exists, N CRM entries, a draft message exists, a mailbox is connected, a second member exists, and so on), cached 60 seconds per workspace. The queries are written against the real tables and tested against the real schema (the same PGlite build as doc 59).

## 6. Data (all additive, keyed to the workspace so export and erasure cover it)
- `onboarding_progress`: `user_id`, `org_id`, `persona`, `tour_id`, `version`, `status` (`not_started`, `in_progress`, `completed`, `dismissed`), `step`, `updated_at`, `completed_at`. One row per person, workspace and tour.
- `onboarding_skips`: `user_id`, `org_id`, `item_key`, `created_at`.
- `help_feedback_daily`: `slug`, `day`, `helpful`, `not_helpful` (counts only).
- `help_misses_daily`: `term`, `day`, `count` (see section 7).
- Flags: `onboarding_tour` and `help_v2` (platform switches, so either can be turned off at once); a per-workspace override later if a customer asks to switch the tour off for their people.
- Routes: `GET/POST /api/onboarding/progress`, `GET /api/onboarding/checklist`, `POST /api/onboarding/skip`, `POST /api/help/feedback`, `POST /api/help/miss`. The tour definition for the person comes with the first call.

## 7. Privacy and measurement
- **Counts, not content, not people.** Tour starts, completions and where people leave; checklist item completions; article views; helpful or not. SAIL shows them per persona and per step. Nothing is sent to a third-party analytics service.
- **Search queries** can contain personal text. They are searched **in the browser**; only a **zero-result term** is ever sent, normalised, cut to 40 characters, stripped of anything that looks like an email address or number, **with no user or workspace attached**, and only if the person has accepted analytical cookies (the existing consent banner). Counts, one row per term and day.
- Progress rows are the person's own settings: included in the personal export and removed on erasure; they hold no content.
- **Staff and demo accounts** do not write progress or counts.

## 8. Testing
- **Pure:** step filtering by persona, entitlements and flags; the progress state machine (start, back, skip, finish, replay, version bump); checklist derivations on the real schema; the search ranking on a fixed set of 30 queries with expected top results (including German and misspelt ones); front-matter validation; token resolution.
- **The accuracy guard** of section 4.2, and the target registry test of section 5.1, run on every build.
- **Component:** the engine's focus handling, Esc and arrow keys, a missing target, a phone width, and reduced motion (jsdom tests, then looked at in the local sandbox with a fresh demo account, with screenshots in the status register).
- **Live check, by the founder:** sign up a fresh account on a deployment with the flags on; take the tour on a laptop and a phone; finish the checklist; open Help from three different pages; ask the assistant a question about the app. Recorded in the status register, as for the other features.

## 9. Slices and build order
Help comes first, because today it is wrong and has dead buttons, which is a trust problem a visitor meets on day one.
- **O0 (about 1 day): the guard and the map.** The article format, the generated index, the accuracy tests, the target registry and the debt register; **no screens**. *Acceptance:* the tests fail on a deliberately broken article, a missing route and an uncovered route.
- **O1 (about 3 days): Help v2.** Home, search, article pages, the shortlist for your role, the real contact; the stale content removed; **the first 15 articles** (everyone, plus the founder essentials). *Acceptance:* every launch article passes the guard; the search finds each by three different phrasings; no dead button remains.
- **O2 (about 2 days): progress and the checklist.** The tables, the checklist derivations, the dashboard card, skip and dismiss. *Acceptance:* a fresh founder account sees the card; uploading a deck ticks the item without a click.
- **O3 (about 4 days): the engine and the founder tour,** with the welcome card, the missing-target and entitlement fallbacks, the cookie-banner wait. *Acceptance:* a fresh account takes the whole tour by keyboard only; a workspace without a feature is not shown it.
- **O4 (about 3 days): the fund, LP and member tours.**
- **O5 (about 3 days): contextual help and the remaining articles** (the "?" drawer, empty states linked to articles, the other 15 articles).
- **O6 (about 2 days): ask about the app,** the `help_search` tool.
- **O7 (about 2 days): SAIL funnel and feedback counters; German copy** if decided.
About 20 working days; O0 and O1 alone make the Help tab trustworthy in about four.

## 10. Decisions for the founder (defaults chosen; change any)
1. **Language.** English first, copy isolated so German can follow (O7). The product is used in German-speaking markets; the search already accepts German terms. Default: English now.
2. **Who may switch the tour off.** Each person (always), and a platform switch for everyone. Default yes; no per-workspace switch until a customer asks.
3. **Does the checklist stay until done?** It stays until done or dismissed, and can be reopened. Default yes.
4. **No email or push nudges** about the tour or the checklist. Default yes (in-app only).
5. **Who writes the articles.** Claude drafts each from the code and the pages, the founder reads and corrects before it ships (the guard checks the facts, not the taste). Default yes.
6. **The support contact** shown in Help (an address, and whether "Book a demo" should exist inside the app at all). **Needed from you;** until given, Help shows a plain "Contact us" link to the existing contact page and no demo button.
7. **Tour for invited members.** A short version without setup items. Default yes.
8. **What "plan" language Help may use.** Only what the plan catalogue states, by name; nothing about "Pro" until it exists. Default yes.

## 11. Not in scope
Video or screen recordings (they go stale and cannot be checked by a test); in-app chat support staffed by people; a community forum; a public documentation site (the articles could be published later, the format allows it); product analytics beyond the counts above; A/B testing of the tour; email drip campaigns; onboarding for the investor-side accounts (`/investor`, doc 64), which have their own journey and get their own pass after this one.

## 12. Build status
O0 and O1 built 2026-11-01 (see docs/status-register.md section 4d). Tokens available to articles today: `{{tier:<id>}}`, `{{tier:<id>.min}}`, `{{stages:list}}`. Articles are in `content/help/*.md` (flat, `personas` in front matter, not per-persona folders). Not built: O2 to O7.
