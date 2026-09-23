# 12 — What each persona should be able to discover

**Date:** 2026-09-22 · **Status:** decision paper, then build · **Decided by the
owner:** founders see investors' **email and LinkedIn**, nothing more, for now.
The VC and LP answers below are this paper's recommendation, from the analysis
in §2–§4. · **Related:** doc 00 (persona isolation), doc 02 (persona-exclusive
routing), doc 10 §7 (Discover gaps).

---

## 1. The rule

**Each persona discovers the counterparties it transacts with — and nothing
that belongs to another persona's private work.**

A founder raises from investors. A fund manager raises from LPs, syndicates
with co-investors and sources startups. An LP allocates to fund managers.
Discovery is a directory of those counterparties, filtered and projected per
persona on the server, so a field a persona may not see is never sent to its
browser.

Three things are **never** discoverable by anyone, whatever the persona:

1. A fund's own LP records — `fund_lps`, `lp_entities`, `lp_commitments`,
   `lp_positions` — and any other workspace's CRM.
2. Internal record fields: embeddings, enrichment state, import metadata, Folk
   custom fields, owner/user ids.
3. Phone numbers and postal addresses of people (decision: not for now).

## 2. What the directory contains (measured 2026-09-22)

| Class | Firms | People (by `investor_type`) |
| --- | --- | --- |
| Venture capital | 9,570 | 28,158 |
| Corporate VC | 1,498 | 4,647 |
| Accelerator | 2,216 | 1,052 |
| Angel | 532 | 6,338 |
| Private equity / growth | 826 | 919 |
| **Family office** | **1,879** | **1,299** |
| **Asset & wealth manager** | **557** | 24 |
| **Sovereign wealth fund** | **115** | 46 |
| **Bank** | **118** | — |
| **Insurance** | **96** | 99 |
| **Institutional (endowment, pension)** | **94** | 24 |
| **Fund house / AMC** | **90** | — |
| **Fund of funds** | **32** | 21 |
| Grant bodies | 144 | — |
| Unclassified / other | ~1,200 | ~3,550 |

The **bold** rows are *allocators* — the institutions that invest in funds.
Roughly **3,000 firms and 1,500 people** qualify, a usable LP universe for a
fund manager. Separately, the platform holds:

- `startups` — 2 rows, with an `is_public` flag (founder opt-in listing);
- `funds` — 2 rows; `fund_profiles` — 1 row (the fund managers on Anker).

## 3. Analysis per persona

### 3.1 Founder — decided

**Discovers:** investors — firms and people, every investing class.
**Sees:** name, firm, title, type, location, stages, sectors, check size,
website, **email (with its verification status)**, **LinkedIn**.
**Does not see:** phone, address, internal fields.
**Actions:** save to the founder CRM; fit score from the founder's latest
matching run; export a selection.

### 3.2 Venture fund manager (VC persona)

A GP's work has three counterparties, so VC Discover has three lenses:

| Lens | Who | Why | Source |
| --- | --- | --- | --- |
| **LPs / allocators** (default) | Family offices, funds of funds, endowments and pensions, insurers, banks, asset and wealth managers, sovereign wealth funds — firms and their people | Fundraising is the GP's scarcest-time job; today VC Discover shows founders' investors, which is the wrong list. | `investment_firms` / `investors` filtered to allocator classes |
| **Co-investors** | VCs, corporate VCs, angels and accelerators active at the GP's stages and sectors | Syndication: who to share deals with, who leads the next round. | same tables, investing classes |
| **Startups** | Companies whose founders chose to be listed (`startups.is_public`) | Deal flow. Opt-in only: a founder's profile is theirs. | `startups WHERE is_public` |

**Sees:** as founders for firms and people (email + LinkedIn, no phone/address);
for startups only the listing fields (name, tagline, stage, sectors,
location, target raise, website, the founder's LinkedIn) — never financials,
cap tables or decks unless the founder shares them through a deal room.
**Actions:** save allocators and co-investors to the fund's CRM; fit from the
fund's LP matchmaking run where one exists.

### 3.3 LP (limited partner)

An LP's discovery job is **manager selection**. LP Discover has two lenses:

| Lens | Who | Why | Source |
| --- | --- | --- | --- |
| **Fund managers** (default) | VC and private-equity firms, venture studios, funds of funds — at the **firm** level, with partners | Finding and diligencing managers to back. | `investment_firms` (GP classes), people linked to them |
| **Funds on Anker** | Funds whose manager chose to list them for LPs | Funds actually raising, with a way to reach the manager. | `funds` with a new `listed_for_lps` flag (opt-in) |

**Sees:** firm name, website, LinkedIn, HQ, stages, sectors, check sizes, AUM
where known, portfolio size; partners with title, email and LinkedIn; for
listed funds, name, strategy, target size, vintage, currency and status.
**Does not see:** founders or startups (LPs do not invest directly here);
other LPs (LP-to-LP discovery would expose who backs whom); any fund's LP
list, terms documents or data room.
**Actions:** view and open links, export a selection. LPs have no CRM today;
a watchlist is future work (doc 03).

**Access.** LP pages sit under `/lp`, which admits only people a GP has
attached to a fund. LP Discover lives there (`/lp/discover`). LPs who subscribe
without a GP invitation cannot reach it until LP workspace provisioning
(doc 01) ships — stated, not solved here.

### 3.4 Why not one directory for everyone

- A **founder** shown allocators would pitch family offices that do not do
  direct deals; a **VC** shown only investors misses its LPs; an **LP** shown
  angels and accelerators gets noise.
- Showing **startups** to anyone but investors, or showing them without the
  founder's opt-in, breaks the founder's control of their own profile.
- Showing **LPs to LPs** reveals relationships LPs consider confidential.

## 4. Visibility matrix

| Field | Founder | VC | LP | Owner console |
| --- | --- | --- | --- | --- |
| Name, firm, title, type | ✓ | ✓ | ✓ | ✓ |
| Location, stages, sectors, check size, AUM, portfolio size | ✓ | ✓ | ✓ | ✓ |
| Website, LinkedIn | ✓ | ✓ | ✓ | ✓ |
| Email + verification status | ✓ | ✓ | ✓ (GP partners only) | ✓ |
| Phone, postal address | — | — | — | ✓ |
| Bio / description | ✓ | ✓ | ✓ | ✓ |
| Enrichment state, import metadata, Folk fields, embeddings | — | — | — | ✓ (admin tools only) |
| Startups (listed) | — | ✓ | — | ✓ |
| Other LPs | — | — | — | ✓ |

## 5. Protection

- **Projection on the server.** Each lens selects an explicit column list; the
  query never returns a column its persona may not see. A test asserts the
  payload keys per lens.
- **Scraping limits.** Pages of at most 100 rows; exports of at most 200 rows
  per file and 1,000 rows per workspace per day; each export is written to the
  audit trail (doc 08).
- **Opt-in listings.** `startups.is_public` and `funds.listed_for_lps` default
  to false and are set only by the owning workspace.

## 6. Routes

| Persona | Route | Lenses |
| --- | --- | --- |
| Founder | `/dashboard/discover` | Investors · Firms |
| VC | `/dashboard/discover` | LPs · Co-investors · Startups |
| LP | `/lp/discover` | Fund managers · Funds on Anker |
