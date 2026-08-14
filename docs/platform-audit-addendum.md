# Platform Audit — Addendum: Feature-Loss Check + Carta Workflow/UI Direction

_2026-08-15. Companion to [platform-audit.md](platform-audit.md). Two jobs: (1) audit what capability is **only** available in the "decommissioned" pages so nothing is lost when we prune, and (2) codify the Carta UI/UX + workflow patterns (from the reference screenshots) to carry into Anker._

---

## ⚠️ Correction to the first audit

The ~19 `/dashboard/admin/*`, `/dashboard/send-center/*`, `/dashboard/imports/*`, and `/dashboard/content/*` pages are **NOT decommissioned.** Their code reads:

```ts
const { isAdmin, email } = await isAdminUser()
if (!isAdmin) redirect("/dashboard")   // ← guard, not a kill-switch
return <AdminShell …><FeaturePanel /></AdminShell>
```

For an **owner/admin they render real, working feature panels.** They redirect only for non-admins. They were removed from the sidebar but the routes and their engines are live. So the correct action is **preserve + consolidate into an Owner Console**, not delete. Deleting them destroys real capability — verified below.

---

## Part A — Capability that lives ONLY in gated/unlinked pages

Grep across all live (non-gated) `app/` + `components/` confirms **no nav-accessible surface** implements these. Verdict column: **Preserve** (relink into Owner Console) · **Merge** (fold into an existing live page) · **Finish** (stub, needs building).

### A1. Data ingestion & hygiene — the pipeline that builds the investor DB
| Feature | Component | Also at | Live replacement? | Verdict |
|---|---|---|:--:|:--:|
| CSV/XLSX bulk import (auto-header map, stable-id dedup, dry-run) | `import-panel` | `/imports` | **None** | Preserve |
| Web crawler (URL/domain → structured firm intel, robots-aware) | `crawl-panel` | `/imports/crawl` | **None** | Preserve |
| AI enrichment (backfill sector/stage/check-size/emails) | `enrichment-panel` | `/imports/enrichment` | **None** | Preserve |
| URL sweep (live/redirect/dead/blocked verdicts) | `url-check-panel` | `/imports/url-check` | **None** | Preserve |
| Email verification (Hunter.io: valid/risky/disposable/no-mx) | `email-check-panel` | `send-center/deliverability` | **None** | Preserve |

_These are the entire data-acquisition layer behind Discover/Find-Investors/Matchmaking. Nothing else feeds the DB. **High loss risk.**_

### A2. Outreach operations
| Feature | Component | Live replacement? | Verdict |
|---|---|:--:|:--:|
| Outbox: drafts queue → Resend, open/click counters, follow-up bucket | `email-outbox-panel` | **Partial** — `/dashboard/outreach` has campaigns, not this send/track queue | Merge → Outreach |
| Reply triage: pending → classified → actioned, AI-classify, advance CRM stage | `inbox-panel` | **None** | Merge → Outreach |
| Deliverability: SPF/DKIM/DMARC + MX before a batch | `email-check-panel` | **None** | Merge → Outreach |
| Agent orchestrator: enrich firm → build profile → draft 4-step DM → schedule | `agent-panel` | **None** (engine runs via cron; no UI) | Preserve |

### A3. Newsroom CMS — the only authoring surface
| Feature | Component | Note | Verdict |
|---|---|---|:--:|
| Article CMS (draft/publish/archive, AI first draft) | `newsroom-list`, `newsroom-editor` | public `/newsroom` is **read-only**; this is the only editor | Preserve |
| News sources + API keys | `news-sources-client` (437L), `news-api-keys-client` (220L) | feeds `promote-scheduled-articles` cron | Preserve |

> **Broken nav today:** the Studio sidebar item **"Newsroom" → `/dashboard/content`** redirects to /dashboard for every non-owner. Either mark it Owner-only (badge) or remove from the general Studio group.

### A4. Platform operations (owner console)
| Feature | Component | State | Verdict |
|---|---|---|:--:|
| System health (DB/Ollama/SearXNG/Marker, pgvector, table counts, router map) | `system-panel` | real | Preserve |
| AI config (force provider, per-task model, task on/off) | `ai-config-panel` | real | Preserve |
| Deep research (multi-page crawl → AI dossier → Word export) | `deep-research-panel` | real | Preserve |
| Audit log (admin actions, LP touches, doc approvals, deck exports) | — | **stub** | Finish |
| Billing & credits (usage meters, AI spend, seats, invoices) | — | **stub** | Finish |
| Users & roles (accounts, roles, sessions) | — | **stub** ("Full UI ships next pass") | Finish |

**Net:** ~15 real capabilities + 3 stubs would be lost by a naive prune. The first audit's "delete the admin tree" line is **rescinded** — replace it with "consolidate into an Owner Console" (below).

---

## Part B — Carta UI/UX + workflow patterns to carry into Anker

Extracted from the reference screenshots (Carta fund-admin / SPV flow). These are the **house style + workflow** to standardize across Anker. Grep confirms Anker has **none** of the ★ items yet.

| # | Carta pattern | What it does | Anker today | Action |
|---|---|---|---|---|
| 1 ★ | **Entity switcher** ("Carta Demo Ventures 221 ⌄", "Switch Entity", `All Entities / SPV` breadcrumb) | one workspace, many entities/funds/SPVs | no switcher | Add global entity switcher + breadcrumb |
| 2 ★ | **Entity tab bar** (Overview · Fund performance · Investments · Partners · Closings · Capital activity · Statements · Accounting · Properties · More) | one tabbed workspace per entity | fund pages are separate bespoke routes | Unify fund-detail cluster into this tab bar |
| 3 ★ | **Partners sub-tabs** (Partners · Contacts · Documents · Information sharing · Email · Transfers) | LP relationship workspace | scattered / missing | Build Partners workspace |
| 4 ★ | **Investor status tiles** (Prospective / Invited / Signed / Countersigned — $ + investor count + inline action: Invite prospects, Countersign, Call capital) | fundraise pipeline as status tiles with actions | Raise Pipeline has stages, not this tile+action pattern | Adopt status-tile pattern |
| 5 ★ | **Fundraising progress bar** with segmented legend ($ per stage) | at-a-glance close progress | none | Add to fund + raise pages |
| 6 ★ | **Information-sharing matrix** (per-partner × SOI / Deal IRR / Fund performance / Cap. account, green "Sharing" / red "Not sharing" dots, Set access, Edit date) | granular per-LP disclosure control | none | Build — ties into the LP portal firewall |
| 7 ★ | **Permissions tooltip** (checklist: Annual report, Capital calls, Distributions, Legal, Tax, Wire Instructions…) | shows exactly what each contact can see | none | Add to contacts |
| 8 ★ | **Email delivery log** (Partner · Email · Subject · Type · Sent · Delivery status dot: Created/Delivered) | audit trail of every LP email | send-center outbox is close but owner-only | Surface per-entity |
| 9 ★ | **Global header: Tasks · Downloads · User menu**, Dashboard nav item with **count badge** (18) | a task queue + async-export tray everywhere | none (no global Tasks/Downloads) | Add global header + task/download trays |
| 10 ★ | **"Staff" badges** (orange pill on staff-only tabs/actions: Properties, Manage partners, Client Context, Contact Documents) | show-don't-hide privileged actions | Anker hides owner tools entirely | Replace hiding with an **Owner/Staff badge** system |
| 11 | **Data room** (Files · Access · Activities tabs, Create folder / Upload, Name+Created-on) | fundraise data room | ✅ Anker has this (`data-room`) | Align styling |
| 12 | **Left nav grouping** (primary: Dashboard/Entities/Investments/Partners/Tax — then MORE: Fund Tax, Reports & Documents, Tools & Services, Resources, Firm Settings, Staff Tools, Add-Ons) | shallow primary + deep "More" | Anker uses persona suites | Keep suites; add a **MORE** overflow + Firm Settings / Staff Tools |
| 13 | **Row action affordances** (Manage contacts, Manage partners, Request Wire Instructions, per-row ⋮ menu, Export, Filter, Search) | consistent table chrome | partial (DataTable) | Standardize table header chrome |
| 14 | **Empty states** ("No transfers found" + illustration) | calm empties | inconsistent | Standard EmptyState component |

### Workflow optimizations these unlock
- **One entity workspace** (patterns 1–3) collapses today's ~15 separate `/portfolio/fund/*` routes into a single tabbed context — far fewer clicks, no losing your place.
- **Status-tile pipeline + progress bar + countersign** (4–5) turns fundraising into a do-the-next-thing flow instead of a report.
- **Information-sharing matrix + permissions tooltip** (6–7) is the real control plane for the LP firewall we already enforce in data — it makes disclosure visible and per-LP editable.
- **Global Tasks + Downloads** (9) gives every long-running engine (matching xlsx, deck build, legal-gen, notice PDFs) a consistent async home instead of ad-hoc spinners.
- **Staff/Owner badges** (10) let us **relink the owner tools in-place** (show, disabled+badged, to non-owners) instead of the current all-or-nothing hide.

---

## Part C — Revised recommendation (supersedes §5 "prune the admin tree")

1. **Build an Owner Console** — one route (`/dashboard/owner` or Carta-style "Staff Tools" group) that re-links every Part-A capability behind the owner badge: Data ops (import/crawl/enrich/url-check/email-check), Outreach ops (outbox/inbox/deliverability/agent), Newsroom CMS, System/AI-config/Research, and the three stubs (Audit/Billing/Users) to finish. **Nothing in Part A gets deleted.**
2. **Fix the two genuinely broken nav links** — "Newsroom" and "Send Center" should either move under the Owner Console with a Staff badge, or leave the general nav. (These were the real defects; the routes behind them are fine.)
3. **Adopt the Carta shell** — entity switcher + tab-bar workspace (patterns 1–3), global Tasks/Downloads header (9), Staff badges (10), standardized table chrome + empty states (13–14). This is the "carry the Carta UI/UX into Anker" ask.
4. **Build the fundraise/LP control plane** — status tiles + progress bar + countersign (4–5), information-sharing matrix + permissions (6–7), per-entity email log (8). These are net-new workflow features Anker lacks.
5. **Only then** the truly-safe prune from the first audit stays valid: `crm/legacy`, `/pricing`, `/platform`, and the two mock pages (`company`, `fundraising`) — none of which have unique capability.

**Bottom line:** the previous "delete ~19 admin pages" was unsafe — they hold ~15 live owner-only capabilities with no replacement. Preserve them in an Owner Console, then spend the UI effort adopting Carta's entity-workspace shell and building the fundraise/LP control-plane patterns that Anker is currently missing.
