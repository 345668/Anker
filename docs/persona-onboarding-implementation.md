# Persona, Onboarding & Profile Architecture — Implementation Doc

**Status:** Proposal / implementation plan
**Owner:** Philippe
**Last updated:** 2026-08-07
**Scope:** Split the platform into two persona paths (**Founder** vs **Venture Capital / Fund**), give each an exclusive onboarding flow, separate **platform admin vs org roles** for both, and a Carta-style entity/profile model.

---

## 1. Why

Today every signed-in user sees the **same 90-page dashboard** regardless of who they are. Navigation groups (`Overview · Source & match · Relationships · Fund & studio · Toolbox`) mix founder tools (cap table, runway, pitch deck) with fund tools (LP ledger, NAV, distributions, fund model). There is **no onboarding**, and the `role` field conflates *persona* (`founder`/`vc`) with *privilege* (`admin`).

Goals:

1. **Persona-aware app** — a Founder and a VC land in different, relevant homes with only their pages.
2. **Exclusive onboarding** — a guided, path-specific wizard that seeds the right entity and modules.
3. **Clean role model** — separate *who you are* (persona), *what you can do on the platform* (platform role), and *what you can do in your org* (org role), Carta-style.
4. **Carta-grade profile/entity creation** — entity-first setup, team invites, verified identity, multi-entity switching, completion checklist.

---

## 2. Core concept: three independent axes

The current single `role` string is overloaded. Split it into **three orthogonal concepts**:

| Axis | Values | Answers | Where it lives |
|---|---|---|---|
| **Persona** (`account_type`) | `founder` \| `vc` | Which product path? | `profiles.account_type` |
| **Platform role** | `user` \| `admin` \| `owner` | Platform oversight level (see §2.1) | `OWNER_EMAILS` / `ADMIN_EMAILS` + `users.is_admin`/`is_owner` |
| **Workspace role** (per membership) | `workspace_owner` \| `admin` \| `member` \| `viewer` | What can they do inside *this* company/fund? | `memberships.org_role` |

> A user can be a **founder** in Company A, a **member/viewer** in Company B (advisor), *and* a **vc** in Fund C. Persona is a property of the **workspace they're currently in**, not a global label — exactly how Carta lets one identity switch between a startup and a fund.

> **Naming — two different "owners".** *Platform Owner* (§2.1) = Anker staff running the whole platform. *Workspace Owner* = the person who created a given company/fund (Carta's org owner). They are unrelated; the tables and code below use `is_owner` for the platform tier and `org_role='workspace_owner'` for the workspace tier to avoid collision.

---

## 2.1 Platform Owner accounts

**Owner accounts oversee the entire platform but are firewalled from tenants' private records.** This is a hard privacy guarantee, not a convenience toggle.

**Seed owners** (`OWNER_EMAILS`, new list in `lib/auth/admin.ts`):
- `masindetphilippe@gmail.com` (already in `ADMIN_EMAILS`)
- `vc@philippemasindet.com`

(`vc@an-ker.de` remains **admin**, not owner, unless promoted.)

**Owners CAN see (platform-wide oversight):**
- All of `/dashboard/admin/*` — system health, billing/credits, audit log, users & roles (account existence, persona, plan, status — **not their private workspace data**), AI config, enrichment/crawl/email tooling.
- **"Pitch us" submissions** — the public `founder_submissions` inbox (from `/apply` → `POST /api/public/submit`). These are *submitted to the platform*, so owners see and triage them.
- Aggregate/analytics: counts, activity, revenue, deliverability, model usage — anything non-record-level.

**Owners CANNOT see (tenant privacy firewall):**
- Any **private per-user / per-workspace record**: a founder's cap table, runway, deals, documents, data room, CRM, AI/ANKER-AI chat history, campaigns, or a fund's LP ledger, NAV, distributions, portfolio, statements.
- I.e. owners get **existence + metadata** of accounts/orgs, never the **contents** of a workspace.

**Enforcement rule:** the tenant data-access layer keys strictly off the **active workspace membership** (`memberships`), and **platform-owner status grants no membership**. Owner status only opens `/dashboard/admin/*` + the submissions inbox + aggregate views. There is **no "impersonate / view as user"** path for owners over private records. Any owner-facing screen must read from admin/aggregate/`founder_submissions` sources — never by joining into a tenant's private tables with the owner's identity.

**Distinction from `admin`:** platform `admin` (existing) = staff operators with `/dashboard/admin/*` access. `owner` = the top tier (superset of admin) explicitly bound by the privacy firewall above. Keep both; `owner ⊃ admin` for menu visibility, but **both** are subject to the no-private-records rule. (If you want a lower staff tier that *can* be granted per-workspace support access, model that as an explicit, audited, time-boxed membership — not as an ambient owner power.)

## 2.2 Enforcing the firewall (how, concretely)

The firewall must be **structural** — a property of the data-access layer, not something each page remembers to check. Two rules:

**Rule 1 — Private reads require a workspace scope; owners can't get one.**
All tenant data flows through a single resolver:
```ts
// lib/org/scope.ts
export async function requireWorkspaceScope(): Promise<{ orgId: string; membership: Membership }> {
  const user = await getUser()                    // Supabase session
  const orgId = await getActiveOrgId()            // anker_org cookie
  const m = orgId ? await getMembership(user.id, orgId) : null
  if (!m) throw new ForbiddenError("No workspace membership")   // ← owners land here
  return { orgId, membership: m }
}
```
Every query for private records (`deals`, `cap_table`, `lp_ledger`, `anker_chats`, documents, …) is filtered `WHERE org_id = scope.orgId`. Because **owner status creates no membership row**, an owner calling a tenant page gets `ForbiddenError`. There is deliberately **no branch** like `if (isOwner) return allRows` anywhere in the tenant data path — that absence *is* the guarantee.

**Rule 2 — Owner surfaces read only from non-tenant sources.**
Owner/admin screens may read only from: the admin/aggregate layer, `founder_submissions`, and **metadata** columns of `organizations`/`profiles`/`users` (name, persona, plan, status, counts, timestamps) — never the content tables. Encode this by giving owner routes a separate helper, `requireOwner()` (sibling of `requireAdmin`), that returns the user but **no `orgId`** — so it's impossible to accidentally pull a tenant scope from an owner context.

**Belt-and-suspenders:** if/when Supabase RLS is enabled on tenant tables, add policies keyed on `membership` so even a mis-written query can't leak across the firewall. Add an **audit event** whenever an owner views the submissions inbox or admin user list, so oversight access is itself logged (feeds `/dashboard/admin/audit`).

## 2.3 Owner accounts have no persona

Owners are **not founders or VCs** — they don't create a company/fund and don't run the persona onboarding (§6). Routing:
- Login as owner → skip persona choice + onboarding → land on an **Owner Console** home (`/dashboard/admin` or a dedicated `/dashboard/owner`) showing: submissions inbox, platform health, user/org directory (metadata), analytics.
- An owner *may* additionally own a real workspace (e.g., `vc@philippemasindet.com` running an actual fund). If so, that's a **separate membership** with its own persona — and inside that workspace they are a normal `workspace_owner`, subject to the same scoping as anyone else. Their platform-owner powers and their workspace data stay in separate lanes; the workspace switcher (§8, item 2) toggles context.

---

## 3. Entity model (Carta-style)

Introduce a **workspace/entity** layer between the user and the data. Two entity kinds:

- **Company** (founder path) — the startup raising capital.
- **Fund / Firm** (VC path) — the investing entity.

```
users (Supabase auth)
  └─ profiles (1:1)            → account_type, display prefs, completion %
        └─ memberships (M:N)   → (user_id, org_id, org_role, persona)
              └─ organizations → kind: 'company' | 'fund', name, slug, verified, settings
                    ├─ company_profile   (stage, sector, incorporation, round target…)
                    └─ fund_profile       (vintage, fund size, strategy, LP types, AUM…)
```

Everything data-bearing (`anker_chats`, deals, cap table, LP ledger, campaigns…) gains an `org_id` foreign key so data is **scoped to the workspace**, not the raw user. Active workspace is stored in a cookie (`anker_org`) + validated against `memberships`.

> **Migration note:** existing tables key off the Supabase user id today. Phase this in — add nullable `org_id`, backfill each user's personal org, then enforce `NOT NULL`. (Full strategy in §14 — we map onto existing `fund_id`/`user_id` anchors rather than rewriting every table.)

### 3.1 Portfolio linking & consented data sharing (decision §12.6)

A fund's **portfolio company is its own `company` organization**, linked to the fund — not just rows inside the fund. This is what enables **founder↔VC data sharing** (Carta's superpower: a founder updates KPIs once, and each of their investors sees them).

```sql
CREATE TABLE IF NOT EXISTS portfolio_links (
  id text PRIMARY KEY,
  fund_org_id    text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,  -- kind='fund'
  company_org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,  -- kind='company'
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
  shared_scopes text[] NOT NULL DEFAULT '{}',   -- e.g. {'kpis','updates','round'}
  invited_by text, created_at timestamptz DEFAULT now(),
  UNIQUE (fund_org_id, company_org_id)
);
```

**Sharing is consented and directional, and it does NOT breach the firewall:**
- The **founder (company workspace) controls** what is shared (`shared_scopes`) and can revoke. Default share = nothing until accepted.
- The fund sees **only** the `shared_scopes` the founder granted — never the company's full private workspace (cap table detail, data room, internal chats stay private unless explicitly shared).
- This is **workspace-to-workspace** sharing between two consenting tenants. It is **orthogonal to platform owners** — an owner (§2.1) still sees neither side's private data; `portfolio_links` grants *funds* scoped visibility, not owners.
- Enforcement: the scope resolver (§14.2) gains a **read-through** path — when the active org is the fund and it requests a linked company's shared data, it may read only rows whose scope ∈ `shared_scopes` for an `active` link. No link / wrong scope → nothing.

**Two entry flows:**
1. **VC adds a portfolio company** → creates a `pending` link + an org-scoped invite to the founder; founder accepts, picks what to share.
2. **Founder already on Anker** → VC links to their existing company org (still founder-consented).
Unlinked/legacy portfolio rows remain valid; linking is additive (a fund can hold both linked orgs and plain rows during migration).

---

## 4. Page → persona map

Legend: **F** = Founder, **V** = VC/Fund, **S** = Shared (both), **A** = Admin-only.
Primary persona shown; `S` pages appear for everyone.

### Founder path (F)
| Page | Route | Notes |
|---|---|---|
| Find Investors | `/dashboard/find-investors` | Deck → investor match |
| Discover | `/dashboard/discover` | Find & match investors |
| Fundraising | `/dashboard/fundraising` | Raise pipeline / process |
| Pipeline | `/dashboard/pipeline` | Investor pipeline |
| Shortlist | `/dashboard/shortlist` | Saved investors |
| Pitch Deck | `/dashboard/pitch-deck` | Analyzer |
| Decks | `/dashboard/decks` | AI-filled decks |
| Term Sheet | `/dashboard/term-sheet` | Red-flag analyzer (reviewing) |
| Cap Table | `/dashboard/cap-table` | Dilution scenarios |
| Runway | `/dashboard/runway` | Burn & runway |
| Company | `/dashboard/company` | Company profile |
| Founder Campaigns | `/dashboard/campaigns` | Public submission → outreach |
| **Tools** | `/dashboard/tools/*` | saas-forecast, ecommerce-forecast, enterprise-saas-forecast, unit-economics, opex-proforma, venture-valuation, qsbs-eligibility, exit-waterfall |

### VC / Fund path (V)
| Page | Route | Notes |
|---|---|---|
| Deal Flow | `/dashboard/portfolio/fund/deals` | Sourcing → IC → close |
| Deals | `/dashboard/deals` | Deal list |
| Pipeline | `/dashboard/pipeline` | Deal pipeline (shared route, VC lens) |
| LP Matchmaking | `/dashboard/matchmaking` | Fund → LP scoring |
| LP Campaign | `/dashboard/outreach/lp-campaign` | LP outreach studio |
| Fund | `/dashboard/portfolio/fund` | Investments · NAV · ledger · economics · legal |
| Fund → Investments/Ledger/Economics/Distributions/Calls/Syndication/Plan/Management/Legal/LP-imports/Assessment | `/dashboard/portfolio/fund/*` | Full fund back-office |
| Portfolio | `/dashboard/portfolio` | Companies · KPIs · updates |
| Portfolio Reports / Updates | `/dashboard/portfolio/reports`, `/updates` | LP reporting |
| Compliance | `/dashboard/portfolio/compliance` | Obligation register |
| **Tools** | `/dashboard/tools/*` | vc-fund-model, vc-performance, fund-of-funds, venture-studio-model, exit-waterfall |

### Shared (S)
Overview/Dashboard · AI Assistant · ANKER AI · CRM (+legacy) · Network · Outreach · Send Center (+replies, deliverability) · Documents · Data Room · Content/Newsroom · Analytics · Matchmaking\* · Imports · Templates · Help · Settings (+API Keys, Extension Tokens).
\*CRM/Network/Outreach carry a **persona lens** (founder = investors; VC = LPs & founders) rather than being duplicated.

### Admin (A)
All of `/dashboard/admin/*` — home, users & roles, audit, system, billing, ai-config, agent, crawl, email(-check), enrichment, imports, inbox, newsroom(+sources, api-keys), research, url-check. Gated by **platform role ∈ {admin, owner}** (already `isAdmin`), *independent of persona*.

**Owner-only surface:** a **Pitch us submissions inbox** — reads `founder_submissions` (from `/apply` → `POST /api/public/submit`) so owners can triage inbound founders. Suggested route `/dashboard/admin/submissions` (owner + admin visible). This is public-submission data, **not** a tenant's private records, so it's inside the §2.1 firewall.

> A **fund admin** and a **founder admin** are both just `org_role = admin` **within their workspace** — that is NOT the same as platform `admin`/`owner` (Anker staff). Keep them separate. And per §2.1, platform owners see admin/aggregate surfaces + submissions, **never** a workspace's private records.

---

## 5. Navigation gating

Extend the existing `NAV_GROUPS` in `components/tesseract/dashboard-sidebar.tsx` with a `personas` field per item (and optional per-group), then filter by the active workspace's persona.

```ts
type Persona = "founder" | "vc"
interface NavItem {
  label: string; href: string; icon: LucideIcon; badge?: string; description?: string
  personas?: Persona[]      // undefined = shared (show to all)
  orgRoles?: OrgRole[]      // undefined = all roles; e.g. ["owner","admin"] for billing-ish pages
}
```

Filtering (server-computed persona passed in, like `isAdmin` already is):
```ts
const visible = (item: NavItem) =>
  (!item.personas || item.personas.includes(activePersona)) &&
  (!item.orgRoles  || item.orgRoles.includes(activeOrgRole))
```

Re-label groups per persona for clarity:

| Group (shared internal key) | Founder heading | VC heading |
|---|---|---|
| Overview | Overview | Overview |
| Source & match | Raise | Deal flow |
| Relationships | Relationships | Relationships |
| Fund & studio | Company & docs | Fund & portfolio |
| Toolbox | Founder tools | Fund tools |

---

## 6. Exclusive onboarding flows

**Gate:** after login, if `profiles.onboarding_completed_at IS NULL`, middleware/layout redirects to `/onboarding`. `/onboarding` picks the branch from `account_type` (chosen at step 0 if unset).

### Shared Step 0 — Choose your path
A two-card chooser (Founder vs VC). Writes `account_type`. Can be pre-set from the invite (see §9) to skip this.

### Founder onboarding (`/onboarding/founder`)
1. **You** — name, role/title, photo, LinkedIn.
2. **Your company** — name, website (→ domain verify), stage (idea/pre-seed/seed/A…), sector, HQ, one-liner.
3. **The raise** — target amount, instrument (SAFE/priced), timeline, use of funds. → seeds Fundraising + Runway.
4. **Cap table (optional import)** — quick founders/options, or "skip for now". → seeds Cap Table.
5. **Assets** — upload/point to pitch deck; connect data room. → seeds Pitch Deck + Data Room.
6. **Connect** — email (for outreach), LinkedIn (for Network). → seeds Outreach + Network.
7. **Invite team** — co-founders/advisors with org role (§7).
8. **Done** — land on Founder Overview with a **completion checklist** (§8).

### VC / Fund onboarding (`/onboarding/vc`)
1. **You** — name, title (GP/Principal/Analyst/Platform), photo, LinkedIn.
2. **Your firm/fund** — firm name, website (→ verify), fund vintage, target/committed size, strategy (stage, geo, sector theses), check size.
3. **Mandate** — thesis keywords → powers Discover/Deal-flow matching + LP Matchmaking.
4. **LP base (optional)** — LP types (institutional, family office, FoF…), import LP list. → seeds LP Matchmaking + Fund/LP ledger.
5. **Portfolio (optional import)** — existing investments. → seeds Portfolio + Fund/Investments.
6. **Connect** — email, LinkedIn, calendar.
7. **Invite team** — partners/analysts/platform/finance with org role (§7).
8. **Done** — land on Fund Overview with a completion checklist.

**Admin vs member on both paths:** the person who **creates the org** becomes `org_role = workspace_owner`. Invited teammates get a role chosen by the inviter. Onboarding for an **invited member** is shorter — skip the entity-creation steps (2–5), do "You" + "Connect" + land in the existing workspace.

Implementation surface:
```
app/onboarding/layout.tsx            # gate + progress chrome
app/onboarding/page.tsx              # Step 0 path chooser
app/onboarding/founder/page.tsx      # multi-step wizard (client)
app/onboarding/vc/page.tsx
app/api/onboarding/route.ts          # POST step data (idempotent, per-step)
components/onboarding/*              # step components, progress bar, entity forms
lib/onboarding/state.ts             # step schema + validation (zod)
```

---

## 7. Org role & permission matrix

Per-workspace roles (Carta-like: Workspace Owner/Admin/Member/Viewer, plus optional functional tags). *(These are the **workspace** tier — distinct from a Platform Owner in §2.1.)*

| Capability | Workspace Owner | Admin | Member | Viewer |
|---|:--:|:--:|:--:|:--:|
| View workspace data | ✅ | ✅ | ✅ | ✅ |
| Edit core records (deals, cap table, campaigns) | ✅ | ✅ | ✅ | — |
| Run AI assistant / ANKER AI | ✅ | ✅ | ✅ | — |
| Send outreach on behalf of org | ✅ | ✅ | ⚙️* | — |
| Manage members & invites | ✅ | ✅ | — | — |
| Billing & plan | ✅ | ✅ | — | — |
| Delete workspace / transfer ownership | ✅ | — | — | — |
| Data-room doc-level access | ✅ | ✅ | scoped | scoped |

⚙️ **Send = Admin+ by default, with a per-member override** (decision §12.3). `workspace_owner`/`admin` always send; a **Member** can only send when an admin flips their `memberships.can_send_outreach` switch (default `false`) — otherwise they draft only. Enforced by `canSend(scope, membership)` in Send-Center + campaign-send handlers; the toggle lives in the team management UI below. **Functional tags** (Legal, Finance, IR/Platform) can further scope module access (e.g., Legal sees `portfolio/fund/legal/*`), mirroring Carta's stakeholder roles.

Enforcement: a single server helper `requireOrg(min: OrgRole)` (sibling to the existing `requireAdmin`) resolves active org + membership and gates route handlers/server actions.

---

## 8. Carta-inspired profile-creation suggestions

Concrete adds beyond the basics:

1. **Entity-first, not user-first.** The unit of value is the Company/Fund. Users attach to entities. Enables clean billing, team, and data scoping.
2. **Workspace switcher** in the sidebar footer (like Carta's org dropdown) — switch persona/entity without re-login; `anker_org` cookie.
3. **Verified identity/entity badges.** Domain verification (email matches company domain or DNS TXT), website + LinkedIn confirmation. Show a "Verified" chip; unlocks outbound sending limits.
4. **Completion checklist with % meter.** Persistent card ("Your profile is 60% complete") linking to the remaining steps — drives activation the way Carta's setup tasks do.
5. **Progressive disclosure.** Onboarding captures the minimum to be useful; deeper data (full cap table, full LP ledger) is optional and promptable later.
6. **Accreditation / KYC-lite for VCs.** Capture LP accreditation status and fund legal entity details where LP reporting is used — gate distribution/statement features on it.
7. **Templated seeding.** Each wizard writes starter records (a draft raise, a sample deal stage board, a data-room skeleton) so no screen is empty on first load.
8. **Invitations as first-class.** Reuse the existing invite-link pattern, but **org-scoped**: an invite carries `org_id` + `org_role` (+ optional `account_type`) so the invitee skips path selection and joins the right workspace at the right level.
9. **Multi-entity membership + roles per entity.** One login → many workspaces, each with its own persona and role.
10. **Audit trail on profile/role changes** (you already have `/dashboard/admin/audit`) — extend to org-level member/role events.

---

## 9. Invitations & routing

Extend today's `SIGNUP_INVITE_CODE` gate into **structured, org-scoped invites** (keep the global code as a fallback for net-new orgs):

- New table `invitations(id, email, org_id, org_role, account_type, token, invited_by, expires_at, accepted_at)`.
- Link: `https://www.an-ker.de/register?invite=<token>`; `/register` forwards to sign-up (already implemented), sign-up validates the token, creates the Supabase user (already implemented), then **auto-creates the membership** with the invite's `org_id`/`org_role` and sets `account_type`.
- **Post-login routing** (new middleware/helper):
  - no membership + no onboarding → `/onboarding`
  - onboarding incomplete → `/onboarding/<persona>`
  - complete → `/dashboard` (persona home: founder → Overview/Raise; vc → Overview/Deal flow)

---

## 10. Data model / migrations (sketch)

`scripts/migrations/2026-08-08-personas.sql`:
```sql
-- personas & completion on profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS account_type text CHECK (account_type IN ('founder','vc')),
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_pct int DEFAULT 0;

-- platform tiers. is_owner ⊃ is_admin. Owners are firewalled from tenant
-- private records at the data-access layer (see §2.1) — this flag only opens
-- /dashboard/admin/* + the submissions inbox + aggregate views.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_owner boolean DEFAULT false;
-- seed owner also enforced in code via OWNER_EMAILS (lib/auth/admin.ts)

-- organizations (company | fund)
CREATE TABLE IF NOT EXISTS organizations (
  id text PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('company','fund')),
  name text NOT NULL,
  slug text UNIQUE,
  verified boolean DEFAULT false,
  settings jsonb DEFAULT '{}'::jsonb,
  created_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS memberships (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  org_id text NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  org_role text NOT NULL CHECK (org_role IN ('workspace_owner','admin','member','viewer')),
  persona text CHECK (persona IN ('founder','vc')),   -- per-workspace persona (decision §12.1)
  can_send_outreach boolean NOT NULL DEFAULT false,   -- per-member send switch (decision §12.3; owner/admin implicitly true)
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, org_id)
);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON memberships(user_id);

-- + organizations.fund_id / owner_user_id pointers (§14.2)
-- + portfolio_links (§3.1) for fund↔company linked orgs & consented sharing

CREATE TABLE IF NOT EXISTS invitations (
  id text PRIMARY KEY,
  email text NOT NULL,
  org_id text REFERENCES organizations(id) ON DELETE CASCADE,
  org_role text NOT NULL DEFAULT 'member',
  account_type text,
  token text UNIQUE NOT NULL,
  invited_by text,
  expires_at timestamptz,
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- entity profiles
CREATE TABLE IF NOT EXISTS company_profile (
  org_id text PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  stage text, sector text, website text, one_liner text,
  round_target numeric, instrument text, hq text, data jsonb DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS fund_profile (
  org_id text PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  vintage int, fund_size numeric, committed numeric, strategy jsonb DEFAULT '{}'::jsonb,
  check_size_min numeric, check_size_max numeric, lp_types text[], data jsonb DEFAULT '{}'::jsonb
);
```
Run via `scripts/oneshot/run-migration.mjs` (existing ledger-aware runner).

---

## 11. Phased delivery

Reflects the §12 decisions: **per-workspace personas + switcher are day-one** (not deferred).

| Phase | Deliverable | Key files |
|---|---|---|
| **0** | Migrations: `organizations`, `memberships` (persona, `can_send_outreach`), `organizations.fund_id`/`owner_user_id` (§14.2); backfill one org per fund + per founder; **`OWNER_EMAILS`/`is_owner` tier** (seed both owners) + `isOwner()` | `scripts/migrations/*`, `lib/auth/admin.ts`, `lib/org/*` |
| **0b** | **Submissions inbox** (§13) + **tenant-privacy firewall** (`requireWorkspaceScope`/`requireOwnerOrAdmin`, no owner path into private records) | `app/dashboard/admin/submissions/*`, `lib/auth/require-owner.ts`, `lib/org/scope.ts` |
| **1** | Active-org (`anker_org`) + **`resolveLanding`** routing (§15) + **workspace switcher** (day-one, per §12.1) | `app/dashboard/layout.tsx`, `lib/org/active.ts`, sidebar footer |
| **2** | Persona **per-workspace**: sign-up path chooser + `resolveLanding` wiring; nav gating by active persona + per-persona headings + route persona-guard (§15.4) | `app/auth/sign-up/*`, `components/tesseract/dashboard-sidebar.tsx` |
| **3** | Founder onboarding wizard + seeding | `app/onboarding/founder/*`, `app/api/onboarding/*` |
| **4** | VC onboarding wizard + seeding | `app/onboarding/vc/*` |
| **5** | Org roles + `requireOrg` guard + **member mgmt UI incl. the per-member send switch** (§12.3) | `lib/auth/require-org.ts`, `app/dashboard/settings/team/*` |
| **6** | **Both invite paths** (§12.4): keep global code + add org-scoped invitations | `invitations` table, `app/api/auth/sign-up`, settings/team |
| **7** | Verification badges, completion checklist | `components/onboarding/checklist.tsx` |
| **8** | Scope core data via resolver (Tier A `org_id`; funds already `fund_id`) — §14 | data-access layer, migrations |
| **9** | **Linked portfolio orgs + consented sharing** (§3.1): `portfolio_links`, share-scope UI, read-through resolver | `portfolio_links`, `app/dashboard/portfolio/*`, `lib/org/scope.ts` |

Phases 0–4 deliver the visible ask (two persona paths + switcher + exclusive onboarding + owner inbox). 5–9 complete the Carta-style multi-entity model (roles, both-invite onboarding, data scoping, founder↔VC linking).

---

## 12. Decisions (resolved 2026-08-07)

All resolved — the plan is buildable. Product calls came from the user; technical defaults are marked *(default)*.

1. **Persona scope → PER-WORKSPACE from day one.** Persona lives on `memberships.persona`, not the account. One login can be a `founder` in one workspace and a `vc` (GP) in another **immediately** — the founder-who's-also-a-GP case is v1, not deferred. Consequence: the **workspace switcher + `anker_org` active-org are day-1 infrastructure** (moved out of Phase 7 — see §11), and `resolveLanding` (§15.1) keys persona off the active membership. `profiles.account_type` becomes an optional *default/hint* for new-workspace creation only, not the source of truth.
2. **Viewers cannot run AI tools** *(default)* — read-only, cost control. Per §7 matrix.
3. **Outbound sending → Admin+ by default, with a per-member override switch.** `workspace_owner`/`admin` can always send. Members **draft** by default and **cannot send** unless an admin flips a per-member switch. Model: `memberships.can_send_outreach boolean default false` (owner/admin implicitly true regardless of the flag); Send-Center + campaign send handlers check `canSend(scope, membership)`. Toggle lives in the team/member management UI (§7).
4. **Keep BOTH invite paths.** Global code (`SIGNUP_INVITE_CODE`, e.g. `anker-vip-…`) → net-new founder/fund creating their **own** workspace (runs full onboarding incl. entity creation). Org-scoped invite token (§9) → **join an existing** workspace at a set role (short onboarding). Both remain supported; sign-up detects which token type it received.
5. **Shared pages use a persona lens** *(default)* — one component taking a `persona` prop that switches copy/columns (CRM/Network/Outreach), not forked pages.
6. **Portfolio companies → LINKED company orgs.** A fund's portfolio company is its **own `company` organization**, linked to the fund via `portfolio_links`, enabling **founder↔VC data sharing** (a founder updates KPIs once; linked investors see the shared subset). This is **consented, workspace-to-workspace** sharing — see §3.1 — and is explicitly **not** a platform-owner power (the §2.1 firewall still holds; owners see neither side's private data). Bigger scope, accepted.

---

## 13. "Pitch us" submissions inbox — spec

The owner/admin surface that displays inbound founder submissions from **Pitch us** (`/apply`). This is the one place §2.1's firewall says owners *may* see content — because these are submissions made **to the platform**, not a tenant's private workspace records.

### 13.1 Data source & how it arrives
- **Table:** `founder_submissions` (DDL in `scripts/migrations/2026-07-25-founder-campaign-engine.sql`).
- **Write path:** `/apply` → `POST /api/public/submit` inserts a row (`status='received'`), uploads deck + data-room files to **private Vercel Blob**, and — importantly — **also auto-creates a deal** on the flagship fund's board via `createDeal(...)` (merged flow: one form feeds both the campaign engine *and* the GP deal board).
- **Firewall consequence (must-honor):** the inbox reads **`founder_submissions`** (+ its own blob materials) only. The **deal** that the same form spawned lives inside the *flagship fund workspace* and is a tenant record — the inbox shows it **only as a linked reference id**, and opening it routes through `requireWorkspaceScope()`. A platform owner with no membership in that fund therefore **cannot** open the deal, exactly as intended. So: submission = visible to owners; the workspace deal it created = governed by that workspace.

### 13.2 Status lifecycle
Canonical enum (already enforced by a CHECK constraint):
```
received ──▶ assessing ──▶ assessed ──▶ campaign_ready ──▶ outreaching ──▶ completed
   │                          │
   └────────────▶ declined ◀──┘                 (any state) ──▶ failed
```
Relevant columns: `assessment_score int`, `assessment_json`, `decline_reason`, `startup_profile_id`, `outreach_campaign_id`, `extracted_json`, `startup_profile_json`, `deck_blob_key`, `data_room_keys[]`, `campaign_batch_id`, `created_at`/`updated_at`.

> The assessment + campaign transitions are **already implemented** in `lib/campaign/orchestrator.ts` and the `api/campaign/*` + `api/cron/campaign-*` routes. The inbox **drives those**, it does not reimplement scoring or sending.

### 13.3 List view
Route **`/dashboard/admin/submissions`** (owner + admin).

- **Metrics strip:** counts by status (received / assessing / assessed / campaign_ready / outreaching / completed / declined / failed) — clickable to filter.
- **Table columns:** `public_ref` · Startup (name + one-liner) · Founder (name, email) · Sectors · Stage · Raise · **Status** (badge) · **Score** (`assessment_score`) · Submitted (relative) · row actions.
- **Filters:** status, sector, stage, `campaign_batch_id`, free-text search (startup/founder/email/ref), date range. **Sort:** newest / score / status.
- **Pagination:** id/`created_at` cursor (reuse the pattern used elsewhere); default 25. Uses existing `founder_submissions_status_idx (status, created_at)`.
- Poll every ~30s (or manual refresh) — no realtime needed.

### 13.4 Detail view
Route `/dashboard/admin/submissions/[ref]` (by `public_ref`). Sections:
1. **Header** — startup name, status badge, score, ref, submitted time; primary actions (§13.5).
2. **Company** — website, one-liner, sectors, stage, raise_amount, check size, location.
3. **Founder & team** — name/title/email/LinkedIn + `team_json`.
4. **Traction & extras** — rendered `traction_json`, `extra_fields_json`.
5. **AI assessment** — `assessment_score` + a readable render of `assessment_json`; "Re-assess" button. Show `extracted_json`/`startup_profile_json` if present.
6. **Materials** — deck (`deck_blob_key`) inline preview + each `data_room_keys[]` file, via **short-lived signed URLs** minted server-side (private blob is never public). Every material open/download writes an **audit event** (§2.2).
7. **Linked records** — `outreach_campaign_id` (link, admin-visible) and the spawned deal **reference** (link that resolves through workspace scope per §13.1).
8. **Provenance** — `campaign_batch_id`, `ip_hash`, `user_agent`, timestamps.

### 13.5 Triage actions (→ status transition)
| Action | Effect | Transition | Reuses |
|---|---|---|---|
| **Assess** | Run AI assessment; write score + json | `received/assessed → assessing → assessed` | `orchestrator` assessment |
| **Advance to campaign** | Build/link outreach campaign | `assessed → campaign_ready` | campaign builder |
| **Start outreach** | Kick the send flow | `campaign_ready → outreaching` | `api/cron/campaign-send` |
| **Decline** | Set `decline_reason` (required) | `* → declined` | — |
| **Mark completed** | Close out | `outreaching → completed` | — |
| **Email founder** | Compose to `founder_email` | (no status change) | Send Center |
| **Open deal** | Jump to spawned deal | (opens fund workspace; scope-gated) | deal board |

All writes go through a single guarded handler; every transition stamps `updated_at` and emits an audit event (actor = owner/admin email).

### 13.6 API surface
```
GET   /api/admin/submissions            # list: filters, sort, cursor  → requireOwnerOrAdmin
GET   /api/admin/submissions/[ref]      # detail (joins linked ids as references)
PATCH /api/admin/submissions/[ref]      # { action, decline_reason? } → transition, audited
GET   /api/admin/submissions/[ref]/material?key=…   # mint short-lived signed blob URL, audited
```
`requireOwnerOrAdmin()` = passes for `isOwner(email) || isAdmin(email)`; returns the actor but **no `orgId`** (§2.2), so the handler physically cannot pull a tenant scope. Validate every `key` belongs to that submission's `deck_blob_key`/`data_room_keys` before signing (no arbitrary blob access).

### 13.7 Build tasks (fits Phase 0b)
- `app/dashboard/admin/submissions/page.tsx` (list) + `[ref]/page.tsx` (detail) — server components, `requireOwnerOrAdmin` gate.
- `components/admin/submissions/*` — table, filters, status badge, detail panels, material viewer.
- `app/api/admin/submissions/route.ts`, `[ref]/route.ts`, `[ref]/material/route.ts`.
- `lib/auth/require-owner.ts` — `requireOwner` / `requireOwnerOrAdmin` (+ `OWNER_EMAILS`/`isOwner` from Phase 0).
- Add **Submissions** to the Admin nav block in `components/tesseract/dashboard-sidebar.tsx` (visible when `isAdmin`, i.e. admin or owner), with a `received`-count badge.
- Audit events for detail views, material access, and transitions → `/dashboard/admin/audit`.

### 13.8 Decisions (inbox-specific)
1. **Bulk actions** — **deferred to v2.** Single-row triage first; multi-select assess/decline later.
2. **Admins triage too** *(decided by user)* — both owners and admins get the full triage actions in §13.5; owners additionally carry the §2.1 firewall guarantee. `requireOwnerOrAdmin()` gates the inbox; every transition is audited with the actor's email.
3. **Duplicate detection** — **yes, flag in list (v1).** On render, mark rows sharing a `founder_email` or normalized `website` with a "dup" chip linking to siblings; cheap (indexed lookup), high triage value. No auto-merge.
4. **Notifications** — **yes, lightweight (v1).** Email owners+admins on new `received` via the existing email infra; digest-style (batched) rather than per-submission to avoid noise. Slack optional later.

---

## 14. Data scoping & migration (the backbone)

The owner firewall (§2.2) and workspace isolation are only as real as the scoping on the data tables. Good news from the schema audit: **we don't start from zero.**

### 14.1 The two anchors that already exist
- **`fund_id`** — present in **12** of ~23 domain tables (investments, ledger, NAV, distributions, calls, deals, LP records…). This *is* the VC workspace scope, already wired.
- **`user_id` / `created_by` / `owner_id`** — per-user scope on personal/founder tables (e.g. `anker_chats`, personal records).

So the job is **not** "add `org_id` to 23 tables and rewrite every query." It's "introduce an org layer that **maps onto the anchors already there.**"

### 14.2 Strategy — map `organizations` onto existing anchors
Give `organizations` a pointer to whichever anchor its kind already uses:
```sql
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS fund_id       text,   -- set when kind='fund'  (→ existing fund row)
  ADD COLUMN IF NOT EXISTS owner_user_id text;   -- set when kind='company' (the founder)
```
The scope resolver translates the **active org** into an existing filter, so most tables need **no DDL change**:
```ts
// lib/org/scope.ts
type Scope =
  | { kind: "fund";    fundId: string }   // fund tables filter WHERE fund_id = fundId
  | { kind: "company"; userId: string }   // personal tables filter WHERE user_id = userId

export async function requireWorkspaceScope(): Promise<Scope> {
  const user = await getUser()
  const org  = await getActiveOrg()                 // anker_org cookie → organizations row
  const m    = org ? await getMembership(user.id, org.id) : null
  if (!m) throw new ForbiddenError("No workspace membership")   // owners land here
  return org.kind === "fund"
    ? { kind: "fund",    fundId: org.fund_id! }
    : { kind: "company", userId: org.owner_user_id! }
}
```
**Firewall falls out for free:** owner has no membership → `requireWorkspaceScope()` throws → the existing `fund_id = …` / `user_id = …` filters already exclude every row. No new leak surface; we reuse filters that ship today.

### 14.3 Backfill (idempotent, ledger-aware runner)
1. **One `fund` org per existing fund** — `INSERT organizations(kind='fund', name, fund_id) SELECT 'fund', name, id FROM funds …`; membership `workspace_owner` for that fund's creator/`created_by`.
2. **One `company` org per existing founder user** — from `local_users`/`profiles` (persona `founder`), `owner_user_id = user.id`; membership `workspace_owner`.
3. **Set `profiles.account_type`** from which org kind they own (fund → `vc`, company → `founder`); mark existing users `onboarding_completed_at = now()` so we don't force veterans through the wizard.
4. **Active-org cookie default** — on first post-migration login, default `anker_org` to the user's sole membership (or the most-recent).

### 14.4 The tables that need genuinely new scoping
Only tables with **neither** anchor get attention, in priority order:
- **Tier A (private, must-scope now):** `anker_chats` and any personal founder records that are only `user_id`-scoped but should be *org*-scoped once companies get teams → add nullable `org_id`, backfill from the owner's company org, filter by `org_id` when present else `user_id`.
- **Tier B (already fund-scoped):** no change — resolver emits `fund_id`.
- **Tier C (public/platform):** `founder_submissions`, newsroom/content, crawl/enrichment caches — **not** tenant-scoped; owners/admins read via §13 / admin layer.

Produce the concrete A/B/C classification by scanning each `CREATE TABLE` for `fund_id` / `user_id` presence — a one-pass audit script, checked into `scripts/oneshot/`.

### 14.5 Safe rollout order (no big bang)
1. Ship `organizations`/`memberships`/pointers + backfill **without** changing any read path (additive only).
2. Introduce `requireWorkspaceScope()` and switch reads **one domain at a time** (funds first — already `fund_id`; then founder/company; then Tier A).
3. Keep the old `user_id`/`fund_id` filters as the *implementation* of the scope — they don't get deleted, they get *sourced from the resolver*.
4. (Optional, later) enforce `org_id NOT NULL` on Tier A once backfill is proven.
5. (Optional, later) enable **RLS** on Tier A/B keyed on `memberships` as defense-in-depth (§2.2).

### 14.6 Gotchas
- **`text` vs `uuid` mismatch:** the audit showed both `fund_id text` and `fund_id uuid` (and `owner_id uuid`) across migrations. The `organizations.fund_id` pointer and the resolver must cast/compare consistently — normalize to `text` at the boundary, or store both `fund_id_text` where needed.
- **Multi-membership users** (founder who's also a GP): scope is **per active org**, never "union of all my data" — the resolver returns exactly one scope.
- **Deals from public submissions** (§13.1) live under the flagship fund's `fund_id` — already covered by Tier B; owners can't reach them, founders/GPs in that fund can.
- **`created_by` ≠ ownership:** some tables use `created_by` for provenance, not access. Don't scope on `created_by`; scope on `fund_id`/`org_id` and treat `created_by` as metadata.

## 15. Persona routing edge cases

**Today:** `/api/auth/sign-in` and `/api/auth/sign-up` both `window.location.assign("/dashboard")` (login honors `?next=`). There is **no** onboarding gate, persona logic, or active-org concept. All of that gets added at **one chokepoint** — the `/dashboard` server layout — so login/sign-up can keep sending users to `/dashboard` and the layout decides where they actually land.

### 15.1 Single source of truth: `resolveLanding()`
Runs in `app/dashboard/layout.tsx` (server) on every dashboard hit, before rendering:
```ts
async function resolveLanding(req): Redirect | Render {
  const user = await getUser()
  if (!user) return redirect(`/auth/login?next=${encodeURIComponent(path)}`)

  // 1. Platform owners/admins: no persona, no onboarding — Owner Console.
  if (isOwner(user.email) || isAdmin(user.email)) {
    // still allowed to hold a workspace; only auto-route to console when they have none
    if (path === "/dashboard" && !(await hasAnyMembership(user.id)))
      return redirect("/dashboard/admin")   // owner/admin home
    // else fall through — they can use a workspace if they have one
  }

  const memberships = await getMemberships(user.id)

  // 2. No workspace at all → onboarding (or accept a pending invite first).
  if (memberships.length === 0) {
    const invite = await pendingInviteFor(user.email)
    if (invite) return redirect(`/onboarding/accept?token=${invite.token}`)
    return redirect("/onboarding")            // Step 0 path chooser
  }

  // 3. Resolve ACTIVE org from cookie; heal if stale/foreign.
  let active = byId(memberships, cookie("anker_org"))
  if (!active) { active = mostRecent(memberships); setCookie("anker_org", active.org_id) }

  // 4. Onboarding incomplete for the active org's persona → finish it.
  const prof = await getProfile(user.id)
  if (!prof.onboarding_completed_at)
    return redirect(`/onboarding/${active.persona}`)

  // 5. Bare /dashboard → persona home. Deep links continue (subject to §15.4).
  if (path === "/dashboard")
    return redirect(active.persona === "vc" ? "/dashboard" /*deal-flow home*/ : "/dashboard" /*raise home*/)

  return render(active)   // pass {persona, orgRole, orgId} to the tree
}
```
> Keep it a **redirect chain of small, idempotent steps**, not one mega-condition — each step is independently testable and safe to re-enter.

### 15.2 Edge-case matrix
| # | Situation | Resolution |
|---|---|---|
| 1 | **Brand-new user, no membership, no invite** | → `/onboarding` (Step 0 chooser) |
| 2 | **Invited member** (invite carries `org_id`+`org_role`+`account_type`) | Sign-up auto-creates membership; skip Step 0 → short "You + Connect" onboarding → land in the invited workspace |
| 3 | **Founder who is also a GP** (2 memberships, 2 personas) | Both exist; **active org** decides the app's persona. Switcher toggles; each switch rewrites `anker_org` and re-runs `resolveLanding` |
| 4 | **Stale/foreign `anker_org` cookie** (removed from that org, or cookie from another device) | Cookie ignored; heal to `mostRecent(memberships)`; never trust the cookie without membership check |
| 5 | **Owner/admin with no workspace** | → `/dashboard/admin` (Owner Console). No persona, no onboarding |
| 6 | **Owner/admin who also owns a real fund** | May switch into that workspace (normal `workspace_owner` scoping); platform powers and workspace data stay separate lanes |
| 7 | **Onboarding abandoned midway** | `onboarding_completed_at` still null → always re-routed to `/onboarding/<persona>`; wizard resumes from last saved step (per-step idempotent writes) |
| 8 | **`account_type` set but membership persona differs** | Membership persona **wins** for routing/nav (a user can be `vc` in one org, `founder` in another). `profiles.account_type` is only the *default* for new-workspace creation |
| 9 | **Multiple pending invites** | Accept-invite screen lists them; accepting one sets it active; others remain pending |
| 10 | **Deleted/suspended active org** | Treated as case #4 (heal to another membership) or #2/#1 if none remain |
| 11 | **Deep link to a page of the other persona** (e.g. founder opens `/dashboard/portfolio/fund/*`) | §15.4 route-guard: redirect to persona home with a toast, **not** a 404 |
| 12 | **`?next=` deep link through login** | Honored **after** onboarding/active-org resolution — never skip the gate to satisfy `next` |

### 15.3 Switching workspaces
- Switcher (sidebar footer, §8) lists memberships grouped by kind, plus "Create new" and (for owners) "Owner Console".
- Selecting one: `POST /api/org/active { orgId }` → validates membership → sets `anker_org` → client hard-navigates to `/dashboard` → `resolveLanding` re-runs. (Hard nav because RSC payloads are persona-specific and must not be reused across a switch — same reason login already uses `window.location.assign`.)

### 15.4 Wrong-persona URL access (defense beyond nav-hiding)
Nav gating (§5) hides links, but users can type URLs or follow stale bookmarks. Add a lightweight **route persona guard** so persona-exclusive sections enforce, not just hide:
- A small map `ROUTE_PERSONA: { "/dashboard/portfolio/fund": "vc", "/dashboard/cap-table": "founder", … }` (prefix match), checked in the dashboard layout after `resolveLanding`.
- If the active persona doesn't match → redirect to the active persona's home with a flash message ("That section is for {other} workspaces"). Shared routes (CRM, Outreach, ANKER AI, Settings) are unlisted → allowed for both.
- This is UX/clarity, **not** the security boundary — the real isolation is data scoping (§14). A founder hitting a fund URL sees their own empty scope anyway; the guard just avoids a confusing empty screen.

### 15.5 Interaction with sign-in/sign-up (minimal change)
- **Keep** both routes redirecting to `/dashboard`; the layout does the rest. No persona logic in the auth routes themselves.
- **Invited sign-up** additionally passes `invite` (already implemented) — extend the token to carry `org_id`/`org_role`/`account_type` (§9) so `resolveLanding` sees a membership on first hit and routes to case #2.
- `?next=` is preserved through login and re-applied **only after** the gate clears.

### 15.6 Decisions (routing-specific)
1. **Default active org** — **most-recently-used** (persist `last_active_org` on switch). A user-pinned "home workspace" is a later nicety; MRU covers v1.
2. **Owner default landing** — **remember last workspace if they have one**, else Owner Console. (Owners who also run a fund shouldn't get bounced to the console every login.) Console is always reachable from the switcher.
3. **Persona home** — **same `/dashboard` route, persona-driven content** (not `/dashboard/vc` vs `/dashboard/founder`). Fewer redirects, stable bookmarks; the layout renders the active persona's widgets.

## 16. Onboarding wizard — UX spec

Detailed UX for the flows sketched in §6. Design goals: **fast to first value, resumable, never a blank screen, every step seeds something real.**

> **SHIPPED direction (updated 2026-08-08): Carta-style clean app UI with serif accents.** The implemented onboarding (`app/onboarding/*`, `components/onboarding/*`) uses Carta's *app* language: a slim app bar, a **left step rail**, a clean form column, and a **live workspace preview card** on the right (the Carta "metric card") that fills as you type. Headings use a **high-contrast serif** (Fraunces ≈ Carta's editorial serif) as accents; body/labels reuse DM Sans / JetBrains Mono; an **orange-square mono eyebrow** marks each step. Platform tokens throughout; the only added colors are the **two persona accents: Founder = vermilion `#e5380f`, Fund = cobalt `#2f45e0`**. (Superseded the earlier Newsroom pass; the *Bleach* treatment in §16.10 remains a suggestion only.)

The **structure/flow (16.1–16.9) is skin-agnostic** — it sits on the same steps, state machine, and seeding regardless of visual treatment.

### 16.1 Shell & chrome
- **Full-screen, focused layout** (`app/onboarding/layout.tsx`) — no dashboard sidebar; Anker logo top-left, **step progress** top-center, **Save & exit** top-right. Theme-aware (§ dark mode).
- **Left rail (desktop):** vertical stepper showing all steps with states — done ✓ / current / upcoming / skipped. Clickable to jump **back** to any completed step; forward only to the next incomplete one.
- **Main column:** one step at a time, max-width ~640px, generous spacing.
- **Footer bar:** `Back` (ghost) · step counter "3 of 8" · `Skip` (only on optional steps) · `Continue` (primary). `Continue` is disabled until the step validates; shows a spinner while its save runs.
- **Mobile:** rail collapses into the top progress bar; same one-step-per-screen; footer sticks to bottom.

### 16.2 Interaction & persistence model
- **Per-step idempotent save.** `Continue` → `POST /api/onboarding/step { orgId, step, data }` → upserts the real records for that step and advances the cursor. Re-submitting the same step is a no-op update (safe to re-enter).
- **Autosave on blur** for text fields (debounced) so a mid-step refresh loses nothing; `Continue` is the commit + validate gate.
- **Progress cursor** stored on the org: `organizations.settings.onboarding = { step, doneSteps[], skipped[] }`. `resolveLanding` (§15) reads `onboarding_completed_at`; the wizard reads the cursor to **resume at the exact step**.
- **Validation** with `zod` schema per step (`lib/onboarding/state.ts`); inline field errors (via `ui/field`), summary toast on failed submit.
- **Optional steps** show `Skip` → records `skipped` and advances; nothing seeded, checklist (§8) later nudges to complete it.
- **Create-early:** the org row is created at the **first entity step** so all later steps have an `orgId` to write against; abandon before that = no orphan org.

### 16.3 Step 0 — Path chooser
Two large cards (`ui/card`) side by side: **"I'm raising / building a company" (Founder)** vs **"I'm investing / running a fund" (VC)**. Each card: icon, one-line description, "what you'll set up" bullets. Selecting one writes `memberships.persona` intent and routes to `/onboarding/founder` or `/onboarding/vc`. **Skipped entirely** when arriving via an org-scoped invite (persona is already known — §16.6) or the global-code path pre-set a persona.

### 16.4 Founder wizard (`/onboarding/founder`)
| # | Step | Key fields / UX | Optional | Seeds → |
|---|---|---|---|---|
| 1 | **You** | name, title, photo (avatar upload), LinkedIn | no | `profiles` |
| 2 | **Your company** | name, website (→ async domain-verify chip), stage (`select`), sector (multiselect, reuse `/apply`), HQ, one-liner. **Accelerator:** "Upload your deck to auto-fill" → runs `/api/founder/extract-profile` and **prefills** this + later steps (user reviews/edits). | no | creates **`company` org** + `company_profile` |
| 3 | **The raise** | target amount, instrument (SAFE/priced `radio-group`), timeline, use-of-funds | no | `fundraising` + `runway` seed |
| 4 | **Cap table** | quick founders/option-pool rows, or **"Skip for now"**; or import CSV | **yes** | `cap-table` seed |
| 5 | **Assets** | pitch deck (drag-drop, reuse apply uploader) + data-room starter | **yes** | `pitch-deck` + `data-room` skeleton |
| 6 | **Connect** | email (for outreach), LinkedIn (for Network) — OAuth/connect buttons with `switch` states | **yes** | `outreach` + `network` |
| 7 | **Invite team** | rows of email + role (`select`: admin/member/viewer) + the send toggle hint; "Skip, I'll do it later" | **yes** | `memberships` + `invitations` |
| 8 | **Done** | success screen → CTA "Go to your dashboard" | — | sets `onboarding_completed_at`, lands on Founder home + checklist |

### 16.5 VC wizard (`/onboarding/vc`)
| # | Step | Key fields / UX | Optional | Seeds → |
|---|---|---|---|---|
| 1 | **You** | name, title (GP/Principal/Analyst/Platform `select`), photo, LinkedIn | no | `profiles` |
| 2 | **Your firm / fund** | firm name, website (verify chip), vintage, target/committed size, check-size range (`slider` or min/max) | no | creates **`fund` org** + `fund_profile` (+ links to existing `funds` row per §14.2) |
| 3 | **Mandate** | thesis keywords (tag input), stage/geo/sector theses | no | powers Discover / Deal-flow / LP matching |
| 4 | **LP base** | LP types (multiselect), import LP list (CSV) | **yes** | `matchmaking` + fund/LP ledger seed |
| 5 | **Portfolio** | import existing investments, or add a few; **offer to link portfolio companies** (§3.1) | **yes** | `portfolio` + `fund/investments`; queues `portfolio_links` invites |
| 6 | **Connect** | email, LinkedIn, calendar | **yes** | outreach + network |
| 7 | **Invite team** | partners/analysts/platform/finance + roles + send toggle | **yes** | `memberships` + `invitations` |
| 8 | **Done** | success → Fund home + checklist | — | `onboarding_completed_at` |

### 16.6 Invited-member short flow (`/onboarding/accept?token=…`)
For someone joining an **existing** workspace (invite carries `org_id`/`org_role`/`account_type`):
1. **Welcome** — "You've been invited to **{Org}** as **{role}**" (org name/logo from the invite).
2. **You** — name, title, photo, LinkedIn.
3. **Connect** — email/LinkedIn (optional).
4. **Done** → lands **inside the invited workspace**. **Skips** all entity-creation steps (2–5/7 of the full flows). Their `onboarding_completed_at` is set on finish.

### 16.7 Completion, seeding & the "no blank screen" rule
- Every wizard writes **starter records** so the destination isn't empty: a draft raise + runway line (founder), a sample deal-stage board + mandate-driven Discover results (VC), a data-room skeleton, a first CRM segment. Skipped steps leave that module in a **guided empty state** ("Add your cap table →") rather than blank.
- On **Done**, `onboarding_completed_at = now()`, cursor cleared, redirect through `resolveLanding` to the persona home, where the **completion checklist** (§8) shows % and links to any skipped/optional steps.

### 16.8 States & edge cases
| State | UX |
|---|---|
| **Resume** | Re-entry lands on `settings.onboarding.step`; completed steps pre-filled from their records |
| **Validation error** | Inline field error + disabled `Continue`; submit-time errors surface as a toast |
| **Upload failure** (deck/CSV/photo) | Non-blocking: keep the step, show retry, allow `Continue` (asset is optional) — mirrors `/apply`'s best-effort uploads |
| **AI prefill (deck extract)** | Spinner "Reading your deck…"; on success, fields fill with an "AI-filled — review" badge; on failure, silent fallback to manual entry |
| **Abandon** | Progress persists; next login `resolveLanding` → back into the wizard; global "Save & exit" also available |
| **Domain verify pending** | Non-blocking chip ("Verifying…/Verified/Couldn't verify"); never blocks `Continue` |
| **Back-edit** | Jumping back and changing entity data re-upserts idempotently; forward steps that derived from it flag "review" if stale |

### 16.9 Build inventory
```
app/onboarding/layout.tsx            # shell, progress, Save & exit, auth+cursor gate
app/onboarding/page.tsx              # Step 0 path chooser
app/onboarding/founder/page.tsx      # founder wizard (client, step state machine)
app/onboarding/vc/page.tsx           # vc wizard
app/onboarding/accept/page.tsx       # invited-member short flow
app/api/onboarding/step/route.ts     # POST per-step upsert (zod-validated, idempotent)
components/onboarding/                # Stepper, StepShell, field groups, DeckPrefill,
                                     #   InviteRows, ConnectButtons, DoneScreen, Checklist
lib/onboarding/state.ts              # step schemas (zod) + cursor helpers + seeding calls
```
Reuse: `/apply` field components (sectors, deck upload), `/api/founder/extract-profile` (deck→profile prefill), existing import/enrichment for CSV steps, `ui/*` primitives throughout.

### 16.10 Visual direction — "Rebirth of Souls"-inspired  *(SUGGESTION ONLY — not shipped)*

> **Status:** parked as an alternative/future treatment. The shipped onboarding uses the Newsroom style (see the callout under §16). Keep this as a reference if we ever want a more cinematic "arrival" moment. A working mockup was built at Step 0 for evaluation.

Translate the **UI *language*** of *Bleach: Rebirth of Souls* — cinematic, dark, high-energy, angular — into the wizard. **Homage to the style, not the IP:** all assets are original; **no** Bleach characters, logos, names, kanji-as-branding, music, or copyrighted art. We borrow the *feel* (energy, motion, sharp geometry), not their content.

**Mood:** a soul stepping into its power. Each onboarding step = "unlocking" part of your workspace, with a rising "spiritual pressure" (progress) as you go.

| Element | Direction |
|---|---|
| **Palette** | Deep near-black base (reuse dark-theme tokens) + a single high-intensity **accent = the Anker gold `primary`** playing the role of "reiatsu" energy. One accent, used as glow — restraint over rainbow. Works in light theme too (accent on light-neutral; glow → subtle). |
| **Geometry** | **Angular / diagonal** panels and dividers (clip-path slashes, ~8–15° skew), sharp corners, thin luminous edge-strokes. Cards feel like beveled energy plates, not soft rounded boxes. |
| **Step transitions** | Directional **slash/ink-wipe** between steps (diagonal reveal + brief speed-lines), ~250–350ms. Content slides in from the slash direction. |
| **Progress = "Spiritual Pressure" gauge** | The stepper (16.1 left rail) is a **vertical energy gauge / soul-chain** that fills and pulses as steps complete; the top bar is a charged meter, not a flat line. Completed nodes glow; current node has a soft aura. |
| **Persona chooser (Step 0)** | **Character-select energy:** two dramatic full-height cards (Founder / VC) with a hover **aura ignite** (glow + slight scale + edge-light sweep) and a decisive "lock-in" pulse on select. This is the money moment — most cinematic screen. |
| **Buttons / focus** | `Continue` = charged primary with a faint animated edge-glow on hover/focus; focus rings are luminous accent (also satisfies a11y focus-visibility). |
| **Micro-motion** | Subtle ambient particle/ember drift in the background at very low opacity; field-complete = brief spark on the check. Keep it *background*, never competing with inputs. |
| **Typography** | Bold, condensed display face for step titles (use the existing display font, heavier weight, tighter tracking, optional uppercase); body stays the readable sans. High contrast. |
| **"Done" screen** | A **release/flourish** reveal (accent bloom + speed-lines resolving into calm) as the workspace "awakens" — the payoff before landing on the dashboard. |

**Hard guardrails (non-negotiable):**
- **Legibility first.** It's a data-entry flow — inputs, labels, and errors stay crisp and standard; drama lives in the chrome, transitions, and empty space, never behind the fields.
- **`prefers-reduced-motion`:** all slashes/particles/glued animation degrade to instant, static equivalents (keep the geometry + palette, drop the motion). Provide a "reduce effects" toggle in Save & exit too.
- **Performance budget:** CSS/SVG/`transform`+`opacity` only (GPU-friendly); no heavy WebGL/video. Particles capped, paused when tab hidden. Must stay smooth on mobile.
- **Theme-aware:** honors light/dark (§ dark mode) — the aesthetic is "charged dark" by default but must not break in light.
- **Accessibility:** WCAG AA contrast on all text over the dark/energy backgrounds; motion is decorative and never conveys state alone (state also shown by ✓/labels).
- **Scope:** this skin is **onboarding-only** (a distinct "arrival" moment); the working dashboard stays the calmer productivity UI. A shared `onboarding-theme` stylesheet + a few motion components (`SlashTransition`, `ReiatsuGauge`, `AuraCard`) keep it contained and reusable.

> Optional follow-up: I can produce a **visual mockup artifact** of Step 0 (persona chooser) + one wizard step in this style to lock the look before building.
Split `role` into **persona × platform-role × workspace-role**; add an **entity layer** (company/fund) with memberships; gate the sidebar by persona; ship **two exclusive onboarding wizards** that seed the right modules; make the **org creator a workspace_owner** and invited teammates admin/member/viewer; and borrow Carta's **entity-first setup, verification, workspace switching, org-scoped invites, and a completion checklist**.

Add a **Platform Owner** tier (seed `masindetphilippe@gmail.com`) that sees everything *platform-level* — admin console, aggregate analytics, and the **"Pitch us" submissions inbox** (`founder_submissions`) — but is **firewalled from every tenant's private records** (cap tables, deals, LP ledgers, chats). Owner ≠ workspace owner; owner status grants no membership and there is no impersonation path into private data.
