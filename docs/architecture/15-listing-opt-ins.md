# 15 — Listing opt-ins: founders to investors, funds to LPs

**Date:** 2026-09-23 · **Status:** design, then build · **Closes:** doc 14 §12
("opt-in toggles"), the two switches the VC-startups and LP-funds lenses read.

---

## 1. The rule

A workspace's record appears in another persona's directory **only because
that workspace switched it on**, and it can be switched off at any moment.
Both flags default to false, and the listing carries only the fields named
below — never the deck, the cap table, the CRM or anything else.

## 2. What exists

| | Today |
| --- | --- |
| `startups.is_public` | The flag the VC "Startups" lens filters on. Two rows exist, both false, keyed by `founder_id` (a user id) with **no link to a workspace**. |
| `funds.listed_for_lps` | Added by the matching-v3 migration, default false. `organizations.fund_id` links a fund workspace to its fund (one exists today). |
| Settings surfaces | `/dashboard/settings` for a workspace; the fund's own settings for a GP. |

So the founder flag needs a workspace link before it can be a workspace
setting: `startups.founder_id` is a person, while listings belong to the
company.

## 3. Design

### 3.1 Founder → "List my company for investors"

```
startup_profiles (latest version, docs/architecture/14 §8)
        │  the founder already reviewed these fields for matching
        ▼
POST /api/founder/listing { listed: true }
        │  upsert the org's startups row from the profile
        ▼
startups (org_id, founder_id, is_public, listed_at, listed_by, …)
        │  is_public = true
        ▼
VC lens "Startups" — name, one-liner, stage, sectors, location,
                      raise amount, website, founder LinkedIn
```

- **Migration:** `startups.org_id text` (+ index), backfilled from
  `organizations.owner_user_id = startups.founder_id`; `listed_at`,
  `listed_by`, `listing_source`.
- **The listing is a projection of the matching profile**, so a founder never
  maintains two copies. Re-listing refreshes it; editing the profile and
  re-running matching refreshes it on the next save.
- **Nothing is listed without a profile.** With no saved profile the toggle
  explains what is missing instead of listing an empty company.
- **Unlisting** sets `is_public = false` immediately; the row stays so the
  founder can re-list without re-entering anything.
- **Audit:** every change recorded with `recordChange` (doc 08) in the
  company's scope, before/after on `is_public`.

### 3.2 Fund manager → "List this fund for LPs"

```
POST /api/portfolio/funds/[id]/listing { listed: true }
        │  the caller must be a member of the org whose fund_id is this fund
        ▼
funds.listed_for_lps = true, listed_for_lps_at, listed_for_lps_by
        ▼
LP lens "Funds on Anker" — name, strategy, vintage, target size,
                            currency, status, manager name
```

- **Never listed:** LP names and commitments, capital calls, distributions,
  documents, or anything else in `fund_lps` / `lp_*` (doc 12 §1).
- **Requires** a fund with a name; a fund still in draft cannot be listed.
- **Audit:** `recordChange` in the fund's scope.

### 3.3 Where the switches live

| Persona | Surface | Control |
| --- | --- | --- |
| Founder | `/dashboard/settings` → Workspace | "List my company for investors" with the exact field list shown underneath and a link to Discover's startup lens |
| VC (GP) | `/dashboard/settings` → Fund | "List this fund for LPs", disabled with a reason when the workspace has no fund |

Both controls state, in one line, who can see the listing and what it
contains, and show when it was last changed.

## 4. Tests

- Listing a company with no saved profile is refused, with the reason.
- Listing writes exactly the projected fields; the deck summary, ARR and
  thesis keywords are **not** written to `startups`.
- A member of another workspace cannot list or unlist this company or fund.
- A listed company appears in the VC lens; unlisting removes it in the same
  request cycle.
- A fund without `organizations.fund_id` cannot be listed.
- Both changes appear in the audit trail with before/after.
