# Anker Venture OS — Full Platform Audit

_Generated 2026-08-15. A complete inventory of every page and its function, the engines / data pipelines / async tasks behind them, what's built vs. stubbed, what to prune, and what to build to a full Carta-grade offering._

---

## 0. Scale & health at a glance

| Surface | Count | Notes |
|---|---:|---|
| Dashboard pages | 134 | ~90 real, ~25 route-stubs/guards, ~19 decommissioned admin |
| Marketing / public pages | 45 | mostly complete; a few prune candidates |
| API routes | 278 | portfolio (93), outreach (37), admin (24), lp (15), crm (11) lead |
| Scheduled (cron) tasks | 5 | outreach, campaigns ×2, compliance digest, newsroom promote |
| Real engines / pipelines | ~10 | matching v2, campaign, assistant, deck AI, ledger/waterfall, legal-gen, KPI-extract, fund-assessment, outreach, matchmaking |

**Verdict:** the platform is **large and mostly real** — the fundraising (founder), fund-ops (VC), and LP surfaces are genuinely built on real data + AI engines. The gaps are (a) a decommissioned Admin tree, (b) two mock pages, (c) a set of new Carta-parity modules that have data + CRUD but not yet their **domain engines** (KYC screening, K-1 generation, loan servicing, 409A computation, contract AI), and (d) a handful of pages not yet on the Carta UI standard.

**Legend:** ✅ complete · 🟡 partial (works, shallow or missing engine) · 🧩 CRUD-only (data model + forms, no engine) · 🎭 mock (hardcoded) · 🔀 redirect stub · ⛔ decommissioned · 🎨 needs Carta-UI rework.

---

## 1. Dashboard — by nav area

### Overview
| Page | Route | Status | Function |
|---|---|:--:|---|
| Dashboard | `/dashboard` | ✅ | QuickStart + Spotlight + My-To-Dos feed (persona-aware) |
| AI Assistant | `/dashboard/assistant` | ✅ | Tool-running agent (CRM/deals/docs) — `lib/assistant` |
| ANKER AI | `/dashboard/anker-ai` | ✅ | Multi-model chatbot (506 LOC) |

### Source & match (founder + vc)
| Discover | `/dashboard/discover` | ✅ 🎨 | 1,315 LOC investor DB search; **functional toolbar header, not PageHeader** |
| Find Investors | `/dashboard/find-investors` | ✅ | 1,066 LOC deck→match, matching v2 founder engine |
| LP Matchmaking | `/dashboard/matchmaking` | ✅ | 818 LOC six-dimension scoring |
| Deal Flow | `…/fund/deals` | ✅ | Sourcing→IC→close board + public submissions |
| Imports | `/dashboard/imports` | ⛔ | admin-shell → redirect; **decommissioned** |

### Relationships
| CRM | `/dashboard/crm` | ✅ | 623 LOC Attio-style powerhouse |
| CRM (legacy) | `/dashboard/crm/legacy` | 🔀 | 388 LOC superseded — **prune** |
| Network | `/dashboard/network` | ✅ | 614 LOC LinkedIn graph |
| Outreach | `/dashboard/outreach` | ✅ | Campaigns/inbox/analytics; Resend + Gmail |
| Founder Campaigns | `/dashboard/campaigns` | ✅ | 585 LOC; campaign orchestrator + cron |
| LP Campaign | `…/outreach/lp-campaign` | ✅ | 1,282 LOC enrich/draft/export |
| Raise Pipeline | `…/fundraising/pipeline` | ✅ | round stages + committed capital |
| Send Center | `/dashboard/send-center` | ⛔ | admin-shell → redirect; **decommissioned but still in nav** |

### Fund back-office (vc)
| Fund | `…/portfolio/fund` | ✅ | 666 LOC detail hub + tabs |
| Fund performance | `…/performance` | ✅ | TVPI/DPI/MOIC/IRR from dated cashflows |
| Financial reporting | `…/reports` | ✅ | quarterly close workflow |
| Data explorer | `…/explorer` | ✅ | recharts measure×dimension |
| Tear sheet | `…/tear-sheet` | ✅ | paged per-company builder |
| Valuations | `/dashboard/valuations` | ✅ | real marks from snapshots |
| Fund Forecasting | `/dashboard/forecasting` | ✅ | **interactive** scenario modeler |
| Capital calls / Distributions | `…/calls`,`…/distributions` | ✅ | Carta wizards + auto-filed PDF notices |
| Investments / Partners / Economics / Ledger / Plan | `…/fund/*` | ✅ | schedule of investments, NAV, ledger, plan-vs-actual |
| Legal (canvas/fields/docs/review) | `…/fund/legal/*` | ✅ | AI legal-field generation (800 LOC fields) |
| Syndication / Management co. | `…/fund/*` | ✅ | SPV syndication, management company |
| Fund assessment (+ wheel) | `…/fund/assessment` | ✅ | AI assessment engine (996 LOC wheel) |
| Portfolio | `/dashboard/portfolio` | ✅ | companies + KPIs + update ingest |
| Compliance | `…/portfolio/compliance` | ✅ | obligation register + weekly digest |

### Fund services (vc)
| KYC / AML | `/dashboard/kyc-aml` | 🧩 | LP screening **dashboard real; screening engine not built** (pseudo-status) |
| Fund Tax | `/dashboard/fund-tax` | 🧩 | K-1 issuance status real; **K-1 generation engine not built** |
| SPVs | `/dashboard/spvs` | 🧩 | full CRUD; **servicing/close automation not built** |
| Loan Operations | `/dashboard/loan-operations` | 🧩 | full CRUD; **interest accrual / amortization engine not built** |
| Contracts | `/dashboard/contracts` | 🧩 | full CRUD; **AI redlines / clause search not built** |

### Equity Suite (founder)
| Cap Table | `/dashboard/cap-table` | ✅ | 520 LOC dilution modeling |
| Share Plans | `/dashboard/share-plans` | 🧩 | grants CRUD + pool; **vesting/exercise engine + cap-table sync not built** |
| Valuations (409A) | `/dashboard/valuations-409a` | 🧩 | request/history CRUD; **OPM/backsolve computation not built** |
| Compensation | `/dashboard/compensation` | 🧩 | band builder CRUD; **market-data pipeline not built** |
| Equity Compliance | `/dashboard/equity-compliance` | 🧩 | filings register CRUD; **registry filing integration not built** |

### Investor room (lp)
| Capital account `/lp` · Distributions `/lp/distributions` · Documents `/lp/documents` | ✅ | scoped capital account, received notices w/ acknowledge, section-grouped docs |

### Studio
| Data room | `/dashboard/data-room` | ✅ | founder raise room (checklist, sharing, tracking) |
| Decks | `/dashboard/decks` | ✅ | Figma templates + AI-filled (deck AI engine) |
| Documents | `/dashboard/documents` | ✅ | 692 LOC pitch deck & data room |
| Newsroom (author) | `/dashboard/content` | ⛔ | admin-shell → redirect; **authoring gated/disabled but still in nav** |

### Toolbox
| Runway ✅ · Term Sheet ✅ · Tools (14 calculators) ✅ · Analytics ✅ | | | all real |

### Account
| Settings `/dashboard/settings` (1,216 LOC) ✅ · API Keys ✅ · Extension tokens ✅ · Help 🟡 |

### Admin (owner) — ⛔ DECOMMISSIONED
All ~19 `/dashboard/admin/*` pages are 41-LOC admin-shell wrappers that **redirect to /dashboard** (agent, ai-config, audit, billing, crawl, email, email-check, enrichment, imports, inbox, research, system, url-check, users, newsroom/*). Effectively **an entire disabled Admin tree.**

---

## 2. Marketing / public pages
| Page | Status | Notes |
|---|:--:|---|
| `/`, hero, features, product-tabs, testimonials, resources, security, CTA, footer | ✅ | Carta serif direction |
| `/solutions/{founders,vcs,lps}` | ✅ | serif hero + numbered deep-dive sections |
| `/products/{discover,deal-flow,fund-os,cap-table,outreach}` | ✅ | shared SolutionPage template |
| `/about`, `/vision`, `/team` | ✅ | de-faked (Dec 2025 concept, pre-seed, solo) |
| `/contact` ("Let's connect") | ✅ | dual CTA + real newsroom cards |
| `/newsroom`, `/newsroom/[slug]` | ✅ | DB-backed editorial |
| `/lp`, `/room/[token]`, `/portal/[token]` | ✅ | LP + investor tokenized rooms |
| `/pricing` | 🟡 | 465 LOC — **removed from nav; prune or repurpose** |
| `/platform` | 🟡 | 308 LOC — overlaps `/products/*`; consolidate |
| `/investor-database`, `/pitch-deck-templates`, `/fundraising-guide` | ✅ | content/SEO pages |
| `/careers`, `/changelog`, `/faq` | ✅ | standard |
| `/onboarding`, `/onboarding/{founder,vc}` | ✅ | onboarding wizard |
| `/apply` (+ `/pitch`→`/apply`) | ✅ | public pitch submission |

---

## 3. Engines & data pipelines

### Built ✅
| Engine | Location | Does |
|---|---|---|
| **Matching v2** | `lib/matching/v2/*` | AI enrichment, semantic scoring, dedup, segmentation, founder + LP engines, xlsx export |
| **Campaign orchestrator** | `lib/campaign/*` | founder-submission assessment, draft, progressive interest-token outreach |
| **Assistant agent** | `lib/assistant/*` | tool-running agent (founder + platform tools), artifacts |
| **Deck AI** | `lib/decks/*`, `lib/ai/*` | pitch-deck analyzer, fund-deck extractor, AI mapper, builder |
| **Fund ledger & waterfall** | `lib/portfolio/{fund-ledger,waterfall,capital-account}.ts` | double-entry ledger, distribution waterfall, capital-account statements |
| **Legal-field generation** | `lib/portfolio/legal-fields-generation.ts` | AI-generated legal document fields + templates (PDF/DOCX) |
| **Fund assessment** | `lib/portfolio/fund-assessment-*.ts` | taxonomy-driven AI fund assessment + history |
| **KPI extraction** | `lib/portfolio/kpi-extract.ts`, `lp-statement-extract.ts` | investor-update / statement ingest → KPIs |
| **Outreach delivery** | `lib/email/resend.ts`, `lib/agents/outreach-agent.ts` | Resend + Gmail send, enrichment, follow-ups, PDF-attached LP notices |
| **Notice PDF** | `lib/portfolio/notice-pdf.ts` | capital-call / distribution PDFs (pdf-lib) auto-filed to data room |

### Missing / not built ⛔ (needed for full parity)
| Engine | For | What's needed |
|---|---|---|
| **KYC/AML screening** | Fund services | sanctions/PEP/ID provider integration; real status pipeline |
| **K-1 / tax generation** | Fund Tax | per-LP K-1 document generation + tax-estimate engine |
| **Loan servicing** | Loan Ops | interest accrual, amortization schedules, payment processing, covenant checks |
| **409A valuation** | Equity Suite | OPM/backsolve/PWERM computation + audit-report generation |
| **Contract AI** | Contracts | clause-level search, AI redlines vs. playbook, e-signature integration |
| **Compensation data** | Compensation | market benchmark ingestion (currently manual bands only) |
| **Notifications** | platform-wide | in-app + email notification engine (deadlines, calls, distributions) beyond the weekly compliance digest |
| **SPV lifecycle** | SPVs | subscription/close flow, per-SPV cap table & waterfall, SPV LP portal |
| **Equity filings** | Equity Compliance | registry (Companies House / registrar) filing integration |
| **Scenario persistence / Monte-Carlo** | Fund Forecasting | save scenarios; probabilistic projections |

---

## 4. Async / scheduled tasks (cron)

### Built ✅ (`vercel.json`)
| Task | Schedule | Function |
|---|---|---|
| `outreach-scheduler` | every 10 min | send queued outreach + follow-ups |
| `campaign-assessment` | every 15 min | AI-assess new founder-campaign submissions |
| `campaign-send` | every 30 min | progressive campaign outreach |
| `compliance-digest` | Mon 08:00 | weekly compliance-filing digest email |
| `promote-scheduled-articles` | hourly | publish scheduled newsroom articles |

### Missing async jobs ⛔
- **Notice batch delivery** — capital-call/distribution notices are sent on demand (route exists) but not scheduled/queued for large LP bases.
- **Deadline reminders** — equity filings, 409A expiry, capital-call due dates (no reminder job).
- **Loan interest accrual** — nightly accrual + amortization posting.
- **K-1 season job** — annual K-1 generation batch.
- **Valuation refresh triggers** — re-value after a raise/tender event.
- **Data-room digest** — periodic "who viewed your room" summary for founders.

---

## 5. Prune list

### Decommissioned — remove routes (⛔)
- **Entire `/dashboard/admin/*` tree** (~19 pages, all redirect to /dashboard). Decide: re-enable a lean owner console, or delete.
- `/dashboard/content/*` (newsroom authoring — redirects; **but "Newsroom" is still a Studio nav item** → broken/gated link to verify & fix or remove).
- `/dashboard/imports/*`, `/dashboard/send-center/*` (redirect stubs; **Send Center is still in the Relationships nav** → fix or remove).

### Duplicates / superseded (prune)
- `/dashboard/crm/legacy` — superseded by crm-powerhouse.
- `/dashboard/templates` → tools (keep redirect only).
- `/platform` — overlaps `/products/*`; fold in.
- `/pricing` — removed from nav; delete or repurpose as a real pricing page.

### Intentional redirects (keep — bookmarks)
- `/dashboard/pipeline`→deals · `/dashboard/chat`→assistant · `…/legal/review`→legal/documents · `/pitch`→/apply · `/login`→/auth/login.

### Mock pages — build for real or remove (🎭)
- `/dashboard/company` (My Companies — hardcoded mock).
- `/dashboard/fundraising` (Fundraising Hub — mock investors/readiness). Note: **Raise Pipeline** already supersedes much of this.

---

## 6. Carta UI rework backlog (🎨)

Most surfaces are already on the Carta standard (PageHeader accent-eyebrow + display title, DataTable, MetricTiles, section grouping). Remaining to align:
- **Discover** — rich functional toolbar header (kept by design); optionally Carta-ize.
- **Fund detail cluster** (`fund-detail-client`, economics, ledger, legal, management, syndication, assessment) — each carries its own bespoke header; unify to PageHeader + fund tab bar.
- **lp-campaign-content** (1,282 LOC) — panel headers; align.
- **help**, **pitch-deck**, **company**, **fundraising** — pre-Carta; rework (or prune the mocks).
- **Chat surfaces** (anker-ai, assistant) — chat UIs; leave.

---

## 7. Feature build-out roadmap (fully building each feature)

Ordered by leverage. Each "🧩 CRUD-only" module needs its **domain engine** to become a real product:

**Tier 1 — turn CRUD modules into real products**
1. **SPV lifecycle** — subscription + close flow (reuse capital-call/distribution wizards), per-SPV cap table & waterfall, SPV LP portal.
2. **Loan servicing engine** — amortization schedules, nightly interest accrual (cron), payment posting, covenant alerts.
3. **409A engine** — OPM/backsolve computation from the cap table; generate an audit-ready report PDF (reuse notice-pdf pipeline).
4. **Share Plans engine** — vesting computation, exercise flow, and **cap-table sync** (grants → cap table).
5. **KYC/AML** — integrate an identity/sanctions provider; replace pseudo-status with a real screening pipeline + document collection.

**Tier 2 — fund-ops depth**
6. **K-1 / tax generation** — per-LP K-1 documents + tax estimates, filed to the LP data room.
7. **Contract AI** — clause search + AI redlines vs. a firm playbook + e-signature.
8. **Notifications engine** — in-app + email, driven by deadlines/calls/distributions/filings (unifies the scattered reminder needs).

**Tier 3 — polish & consolidation**
9. **Compensation data pipeline** — ingest market benchmarks so bands are data-backed.
10. **Fund Forecasting persistence** — save named scenarios; add probabilistic (Monte-Carlo) projections.
11. **Admin console** — a lean, real owner console (users/roles, system health, audit) to replace the decommissioned tree, or remove it.
12. **Newsroom authoring** — re-enable `/dashboard/content` (or repoint the Studio nav item) so the "Newsroom" link works.

---

## 8. Recommended sequence

1. **Prune & fix nav integrity** (fast): delete crm/legacy, /pricing, /platform; fix or remove the **Send Center** and **Newsroom** nav items that point at redirecting routes; decide Admin's fate. _Removes dead ends and broken links._
2. **Replace the 2 mock pages** (company, fundraising) — or prune them (Raise Pipeline covers fundraising).
3. **Tier-1 engines** (SPV lifecycle → Loan servicing → 409A → Share Plans → KYC) — the highest-value "make CRUD real."
4. **Notifications engine** — unblocks deadline/call/distribution/filing reminders across every module.
5. **Carta-UI pass** on the fund-detail cluster + lp-campaign + remaining pre-Carta pages.
6. **Tier-2/3** depth (K-1, Contract AI, comp data, forecasting persistence, admin console).

**Bottom line:** the platform is broad and genuinely functional across all three personas. The next phase is **depth, not breadth** — give the new Carta-parity modules their domain engines, prune the decommissioned/mocked routes, fix the two broken nav links, and finish the Carta-UI pass on the older fund-detail pages.
